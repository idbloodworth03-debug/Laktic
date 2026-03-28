import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

type NotificationState = 'unsupported' | 'disabled' | 'granted' | 'blocked' | 'loading';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function useNotifications() {
  const [state, setState] = useState<NotificationState>('loading');
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);

  // Check support + existing permission + register SW
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }

    // Load VAPID public key
    apiFetch('/api/notifications/vapid-key')
      .then((data) => {
        if (!data.enabled) { setState('unsupported'); return; }
        setVapidKey(data.key);
      })
      .catch(() => setState('unsupported'));

    // Register service worker
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        setSwReg(reg);
        const perm = Notification.permission;
        if (perm === 'granted') {
          // Check if already subscribed
          apiFetch('/api/notifications/status')
            .then((s) => setState(s.subscribed ? 'granted' : 'disabled'))
            .catch(() => setState('disabled'));
        } else if (perm === 'denied') {
          setState('blocked');
        } else {
          setState('disabled');
        }
      })
      .catch(() => setState('unsupported'));
  }, []);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!swReg || !vapidKey) return false;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('blocked');
        return false;
      }

      const subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer
      });

      const { endpoint, keys } = subscription.toJSON() as any;
      await apiFetch('/api/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
      });

      setState('granted');
      return true;
    } catch {
      setState('disabled');
      return false;
    }
  }, [swReg, vapidKey]);

  const disable = useCallback(async (): Promise<boolean> => {
    if (!swReg) return false;

    try {
      const sub = await swReg.pushManager.getSubscription();
      if (sub) {
        await apiFetch('/api/notifications/unsubscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        await sub.unsubscribe();
      }
      setState('disabled');
      return true;
    } catch {
      return false;
    }
  }, [swReg]);

  return { state, enable, disable };
}
