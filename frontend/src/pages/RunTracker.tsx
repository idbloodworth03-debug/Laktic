import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiFetch } from '../lib/api';

// Fix Leaflet's broken default icon paths in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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
  if (!isFinite(paceSecPerMile)) return '--:--';
  const m = Math.floor(paceSecPerMile / 60);
  const s = Math.round(paceSecPerMile % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMiles(meters: number): string {
  return (meters / 1609.34).toFixed(2);
}

type RunState = 'idle' | 'running' | 'paused' | 'done';
interface Coord { lat: number; lon: number; ts: number; }

// Keeps map centered on current position while running
function MapFollow({ pos }: { pos: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(pos, map.getZoom());
  }, [pos, map]);
  return null;
}

// Jumps to actual GPS location once on first lock
function SetViewOnGPS({ pos }: { pos: [number, number] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!done.current) {
      done.current = true;
      map.setView(pos, 20);
    }
  }, [pos, map]);
  return null;
}

// Current position dot
function PositionDot({ pos }: { pos: [number, number] }) {
  const map = useMap();
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng(pos);
    } else {
      markerRef.current = L.circleMarker(pos, {
        radius: 8,
        fillColor: '#00E5A0',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).addTo(map);
    }
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    markerRef.current?.setLatLng(pos);
  }, [pos]);

  return null;
}

export function RunTracker() {
  const nav = useNavigate();
  const [runState, setRunState] = useState<RunState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [gpsReady, setGpsReady] = useState(false);

  // Map state — drives re-renders for route drawing
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7128, -74.0060]); // default NYC

  const coordsRef = useRef<Coord[]>([]);
  const lastCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const pausedSecondsRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Pre-warm GPS and set initial map center
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('GPS not available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setGpsReady(true);
        setCurrentPos([lat, lon]);
        setMapCenter([lat, lon]);
      },
      () => setGpsError('GPS signal not found. Make sure location access is allowed, then try again.'),
      { enableHighAccuracy: true, timeout: 20000 }
    );
  }, []);

  const startWatchingGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        const { latitude: lat, longitude: lon } = pos.coords;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
        const ts = Date.now();
        const newPos: [number, number] = [lat, lon];
        setCurrentPos(newPos);
        if (lastCoordRef.current) {
          const d = haversine(lastCoordRef.current.lat, lastCoordRef.current.lon, lat, lon);
          if (d >= 2 && d <= 100) {
            // Valid movement — draw and count
            setRoutePoints(prev => [...prev, newPos]);
            setDistanceM(prev => prev + d);
            lastCoordRef.current = { lat, lon };
            coordsRef.current.push({ lat, lon, ts });
          } else if (d > 100) {
            // GPS glitch — reset anchor without drawing or counting distance
            lastCoordRef.current = { lat, lon };
          }
          // d < 2: noise, ignore entirely
        } else {
          setRoutePoints(prev => prev.length === 0 ? [newPos] : [...prev, newPos]);
          lastCoordRef.current = { lat, lon };
          coordsRef.current.push({ lat, lon, ts });
        }
      },
      (err) => setGpsError(`GPS error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 0 } as PositionOptions
    );
  }, []);

  const stopWatchingGPS = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const acquireWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
        wakeLockRef.current = await Promise.race([(navigator as any).wakeLock.request('screen'), timeout]);
      } catch { /* device may not support it or timed out */ }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const handleStart = useCallback(() => {
    setGpsError(null);
    startTimeRef.current = new Date();
    setRunState('running');
    // Seed trail and lastCoord from pre-warmed GPS so line starts at origin
    if (currentPos) {
      lastCoordRef.current = { lat: currentPos[0], lon: currentPos[1] };
      setRoutePoints([currentPos]);
    }
    startWatchingGPS();
    startTimer();
    acquireWakeLock();
  }, [startWatchingGPS, startTimer, currentPos, acquireWakeLock]);

  const handlePause = useCallback(() => {
    setRunState('paused');
    stopWatchingGPS();
    stopTimer();
    pauseStartRef.current = Date.now();
    lastCoordRef.current = null;
    releaseWakeLock();
  }, [stopWatchingGPS, stopTimer, releaseWakeLock]);

  const handleResume = useCallback(() => {
    if (pauseStartRef.current) {
      pausedSecondsRef.current += Math.floor((Date.now() - pauseStartRef.current) / 1000);
      pauseStartRef.current = null;
    }
    setRunState('running');
    startWatchingGPS();
    startTimer();
    acquireWakeLock();
  }, [startWatchingGPS, startTimer, acquireWakeLock]);

  const handleStop = useCallback(() => {
    // Flush any open pause so pause→stop without resume doesn't lose that time
    if (pauseStartRef.current) {
      pausedSecondsRef.current += Math.floor((Date.now() - pauseStartRef.current) / 1000);
      pauseStartRef.current = null;
    }
    stopWatchingGPS();
    stopTimer();
    releaseWakeLock();
    setRunState('done');
  }, [stopWatchingGPS, stopTimer, releaseWakeLock]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const avgSpeed = elapsed > 0 ? distanceM / elapsed : 0;
      await apiFetch('/api/athlete/activities', {
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

  const handleDiscard = useCallback(() => nav('/athlete/dashboard'), [nav]);

  useEffect(() => {
    return () => { stopWatchingGPS(); stopTimer(); releaseWakeLock(); };
  }, [stopWatchingGPS, stopTimer, releaseWakeLock]);

  // Warn if user tries to close/navigate away during an active run
  useEffect(() => {
    if (runState !== 'running' && runState !== 'paused') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [runState]);

  const miles = distanceM / 1609.34;
  const pace = formatPace(distanceM, elapsed);
  const isTracking = runState === 'running' || runState === 'paused';

  return (
    <div style={{ height: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', fontFamily: 'DM Sans, sans-serif', color: '#fff', overflow: 'hidden' }}>

      {/* Compact header — Back button only */}
      <div style={{ padding: '12px 20px 6px', flexShrink: 0 }}>
        <button
          onClick={() => {
            if ((runState === 'running' || runState === 'paused') && !window.confirm('Leave this page? Your run will be lost.')) return;
            nav('/athlete/dashboard');
          }}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', padding: 0 }}
        >
          ← Back
        </button>
      </div>

      {/* GPS error — sits between header and map */}
      {gpsError && (
        <div style={{ margin: '0 16px 6px', background: 'rgba(255,80,80,0.12)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#ff6b6b', flexShrink: 0 }}>
          {gpsError}
        </div>
      )}

      {/* Map — fills all space between header and stats */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <MapContainer
          center={mapCenter}
          zoom={16}
          maxZoom={20}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            maxNativeZoom={19}
            maxZoom={20}
          />
          {routePoints.length >= 1 && (
            <>
              {/* Glow layer */}
              <Polyline positions={routePoints} color="#00E5A0" weight={10} opacity={0.2} />
              {/* Solid line */}
              <Polyline positions={routePoints} color="#00E5A0" weight={4} opacity={1} />
            </>
          )}
          {currentPos && <PositionDot pos={currentPos} />}
          {currentPos && <SetViewOnGPS pos={currentPos} />}
          {isTracking && currentPos && <MapFollow pos={currentPos} />}
        </MapContainer>

        {/* GPS locating overlay */}
        {!gpsReady && !gpsError && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,10,10,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            Acquiring GPS…
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '12px 16px', flexShrink: 0 }}>
        <StatCard label="Distance" value={miles.toFixed(2)} unit="mi" accent={runState === 'running'} />
        <StatCard label="Time" value={formatTime(elapsed)} unit="" accent={runState === 'running'} />
        <StatCard label="Pace" value={pace} unit="/mi" accent={runState === 'running'} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px 16px 32px', gap: 16, flexShrink: 0 }}>
        {runState === 'idle' && (
          <button
            onClick={handleStart}
            disabled={!gpsReady && !gpsError}
            style={{ width: 100, height: 100, borderRadius: '50%', background: gpsReady ? '#00E5A0' : 'rgba(0,229,160,0.3)', border: 'none', cursor: gpsReady ? 'pointer' : 'default', fontSize: 15, fontWeight: 700, color: '#000', boxShadow: gpsReady ? '0 0 40px rgba(0,229,160,0.4)' : 'none', transition: 'all 0.2s' }}
          >
            {gpsReady ? 'START' : 'Locating…'}
          </button>
        )}

        {runState === 'running' && (<>
          <button onClick={handlePause} style={{ width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff' }}>PAUSE</button>
          <button onClick={handleStop} style={{ width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,60,60,0.15)', border: '2px solid rgba(255,60,60,0.3)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#ff6b6b' }}>STOP</button>
        </>)}

        {runState === 'paused' && (<>
          <button onClick={handleResume} style={{ width: 90, height: 90, borderRadius: '50%', background: '#00E5A0', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#000', boxShadow: '0 0 30px rgba(0,229,160,0.35)' }}>RESUME</button>
          <button onClick={handleStop} style={{ width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,60,60,0.15)', border: '2px solid rgba(255,60,60,0.3)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#ff6b6b' }}>STOP</button>
        </>)}

        {runState === 'done' && (
          <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Run complete</p>
              <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700 }}>{miles.toFixed(2)} mi in {formatTime(elapsed)}</p>
            </div>
            {saveError && <p style={{ fontSize: 13, color: '#ff6b6b', textAlign: 'center', margin: 0 }}>{saveError}</p>}
            <button onClick={handleSave} disabled={saving} style={{ padding: '14px', borderRadius: 12, background: '#00E5A0', border: 'none', cursor: saving ? 'default' : 'pointer', fontSize: 15, fontWeight: 700, color: '#000', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save Run'}
            </button>
            <button onClick={handleDiscard} style={{ padding: '12px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              Discard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, accent }: { label: string; value: string; unit: string; accent: boolean }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent ? 'rgba(0,229,160,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center', transition: 'border-color 0.3s' }}>
      <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: accent ? '#00E5A0' : '#fff', lineHeight: 1 }}>
        {value}{unit && <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.35)', marginLeft: 2 }}>{unit}</span>}
      </p>
    </div>
  );
}
