import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

// Haversine formula — returns distance in meters between two GPS coords
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatPace(distanceMeters: number, elapsedSeconds: number): string {
  if (distanceMeters < 10 || elapsedSeconds < 1) return '--:--';
  const paceSecPerMile = (elapsedSeconds / distanceMeters) * 1609.34;
  const m = Math.floor(paceSecPerMile / 60);
  const s = Math.round(paceSecPerMile % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMiles(meters: number): string {
  return (meters / 1609.34).toFixed(2);
}

type RunState = 'idle' | 'running' | 'paused' | 'done';

interface Coord { lat: number; lon: number; ts: number; }

export function RunTracker() {
  const nav = useNavigate();
  const [runState, setRunState] = useState<RunState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [gpsReady, setGpsReady] = useState(false);

  const coordsRef = useRef<Coord[]>([]);
  const lastCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const pausedSecondsRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);

  // Pre-warm GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('GPS not available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setGpsReady(true),
      () => setGpsError('Unable to access GPS. Please allow location access and try again.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const startWatchingGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const ts = Date.now();
        if (lastCoordRef.current) {
          const d = haversine(lastCoordRef.current.lat, lastCoordRef.current.lon, lat, lon);
          // Filter GPS jitter — ignore jumps < 2m or > 50m between readings
          if (d >= 2 && d <= 50) {
            setDistanceM(prev => prev + d);
          }
        }
        lastCoordRef.current = { lat, lon };
        coordsRef.current.push({ lat, lon, ts });
      },
      (err) => setGpsError(`GPS error: ${err.message}`),
      { enableHighAccuracy: true, distanceFilter: 2 } as PositionOptions
    );
  }, []);

  const stopWatchingGPS = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStart = useCallback(() => {
    setGpsError(null);
    startTimeRef.current = new Date();
    setRunState('running');
    startWatchingGPS();
    startTimer();
  }, [startWatchingGPS, startTimer]);

  const handlePause = useCallback(() => {
    setRunState('paused');
    stopWatchingGPS();
    stopTimer();
    pauseStartRef.current = Date.now();
  }, [stopWatchingGPS, stopTimer]);

  const handleResume = useCallback(() => {
    if (pauseStartRef.current) {
      pausedSecondsRef.current += Math.floor((Date.now() - pauseStartRef.current) / 1000);
    }
    setRunState('running');
    startWatchingGPS();
    startTimer();
  }, [startWatchingGPS, startTimer]);

  const handleStop = useCallback(() => {
    stopWatchingGPS();
    stopTimer();
    setRunState('done');
  }, [stopWatchingGPS, stopTimer]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const avgSpeed = elapsed > 0 ? distanceM / elapsed : 0;
      await apiFetch('/athlete/activities', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Manual Run',
          start_date: startTimeRef.current?.toISOString() ?? new Date().toISOString(),
          distance_meters: Math.round(distanceM),
          moving_time_seconds: elapsed,
          elapsed_time_seconds: elapsed + pausedSecondsRef.current,
          average_speed: avgSpeed,
          route_coordinates: coordsRef.current,
        }),
      });
      nav('/athlete/activities');
    } catch (e: any) {
      setSaveError(e.message ?? 'Failed to save run.');
    } finally {
      setSaving(false);
    }
  }, [distanceM, elapsed, nav]);

  const handleDiscard = useCallback(() => {
    nav('/athlete/dashboard');
  }, [nav]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWatchingGPS();
      stopTimer();
    };
  }, [stopWatchingGPS, stopTimer]);

  const miles = parseFloat(formatMiles(distanceM));
  const pace = formatPace(distanceM, elapsed);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'DM Sans, sans-serif',
        color: '#fff',
      }}
    >
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 400, marginBottom: 40 }}>
        <button
          onClick={() => nav('/athlete/dashboard')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', padding: 0 }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 0 }}>Track Run</h1>
      </div>

      {/* GPS error banner */}
      {gpsError && (
        <div style={{ width: '100%', maxWidth: 400, background: 'rgba(255,80,80,0.12)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#ff6b6b' }}>
          {gpsError}
        </div>
      )}

      {/* Stats */}
      <div style={{ width: '100%', maxWidth: 400, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 48 }}>
        <StatCard label="Distance" value={miles.toFixed(2)} unit="mi" accent={runState === 'running'} />
        <StatCard label="Time" value={formatTime(elapsed)} unit="" accent={runState === 'running'} />
        <StatCard label="Pace" value={pace} unit="/mi" accent={runState === 'running'} />
      </div>

      {/* Controls */}
      {runState === 'idle' && (
        <button
          onClick={handleStart}
          disabled={!gpsReady && !gpsError}
          style={{
            width: 120, height: 120, borderRadius: '50%',
            background: gpsReady ? '#00E5A0' : 'rgba(0,229,160,0.3)',
            border: 'none', cursor: gpsReady ? 'pointer' : 'default',
            fontSize: 16, fontWeight: 700, color: '#000',
            boxShadow: gpsReady ? '0 0 40px rgba(0,229,160,0.4)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          {gpsReady ? 'START' : 'Locating…'}
        </button>
      )}

      {runState === 'running' && (
        <div style={{ display: 'flex', gap: 16 }}>
          <button
            onClick={handlePause}
            style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#fff' }}
          >
            PAUSE
          </button>
          <button
            onClick={handleStop}
            style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,60,60,0.15)', border: '2px solid rgba(255,60,60,0.3)', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#ff6b6b' }}
          >
            STOP
          </button>
        </div>
      )}

      {runState === 'paused' && (
        <div style={{ display: 'flex', gap: 16 }}>
          <button
            onClick={handleResume}
            style={{ width: 100, height: 100, borderRadius: '50%', background: '#00E5A0', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#000', boxShadow: '0 0 30px rgba(0,229,160,0.35)' }}
          >
            RESUME
          </button>
          <button
            onClick={handleStop}
            style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,60,60,0.15)', border: '2px solid rgba(255,60,60,0.3)', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#ff6b6b' }}
          >
            STOP
          </button>
        </div>
      )}

      {runState === 'done' && (
        <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px 16px', textAlign: 'center', marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Run complete</p>
            <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700 }}>{miles.toFixed(2)} mi in {formatTime(elapsed)}</p>
          </div>
          {saveError && (
            <p style={{ fontSize: 13, color: '#ff6b6b', textAlign: 'center', margin: 0 }}>{saveError}</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '16px', borderRadius: 12, background: '#00E5A0', border: 'none', cursor: saving ? 'default' : 'pointer', fontSize: 16, fontWeight: 700, color: '#000', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Run'}
          </button>
          <button
            onClick={handleDiscard}
            style={{ padding: '14px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, unit, accent }: { label: string; value: string; unit: string; accent: boolean }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent ? 'rgba(0,229,160,0.2)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 12,
      padding: '14px 10px',
      textAlign: 'center',
      transition: 'border-color 0.3s',
    }}>
      <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: accent ? '#00E5A0' : '#fff', lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.35)', marginLeft: 2 }}>{unit}</span>}
      </p>
    </div>
  );
}
