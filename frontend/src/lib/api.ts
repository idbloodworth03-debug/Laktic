import { supabase } from './supabaseClient';

const BASE = import.meta.env.VITE_API_URL as string || 'http://localhost:3001';

function redirectToSignIn() {
  window.location.href = '/signin';
}

async function buildHeaders(token: string | null, incoming: HeadersInit = {}): Promise<Record<string, string>> {
  const base: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) base['Authorization'] = `Bearer ${token}`;
  return { ...base, ...(incoming as Record<string, string>) };
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  // FIX 1 — always get a fresh token per request
  const { data: { session } } = await supabase.auth.getSession();
  let token = session?.access_token ?? null;

  if (!token) {
    await supabase.auth.signOut();
    redirectToSignIn();
    throw new Error('No session');
  }

  let res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: await buildHeaders(token, options.headers),
  });

  // FIX 2 — 401: refresh once, retry, then sign out
  if (res.status === 401) {
    const { data: refreshData } = await supabase.auth.refreshSession();
    const newToken = refreshData.session?.access_token ?? null;

    if (newToken) {
      token = newToken;
      res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: await buildHeaders(token, options.headers),
      });
    }

    if (res.status === 401) {
      await supabase.auth.signOut();
      redirectToSignIn();
      throw new Error('Session expired');
    }
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
