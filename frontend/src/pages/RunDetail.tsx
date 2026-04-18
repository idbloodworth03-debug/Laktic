import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { AppLayout, Spinner } from '../components/ui';

// Fix Leaflet icon paths broken by Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface Coord { lat: number; lon: number; ts: number; }
interface Activity {
  id: string;
  name: string;
  start_date: string;
  distance_meters: number;
  moving_time_seconds: number;
  elapsed_time_seconds: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  total_elevation_gain: number;
  average_speed: number;
  source: string;
  activity_type: string;
  raw_data: { route_coordinates?: Coord[] } | null;
}

function fmtMiles(m: number) { return (m / 1609.34).toFixed(2); }
function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
function fmtPace(speedMs: number): string {
  if (!speedMs) return '--:--';
  const pps = 1609.34 / speedMs;
  const m = Math.floor(pps / 60);
  const s = Math.round(pps % 60);
  return `${m}:${s.toString().padStart(2, '0')} /mi`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation() as { state?: { activity?: Activity } };
  const nav = useNavigate();
  const { role, profile, clearAuth } = useAuthStore();
  const [activity, setActivity] = useState<Activity | null>(state?.activity ?? null);
  const [loading, setLoading]   = useState(!state?.activity);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (activity) return;
    apiFetch(`/api/athlete/activities/${id}`)
      .then(res => setActivity(res.activity))
      .catch(e  => setError(e.message || 'Failed to load run'))
      .finally(() => setLoading(false));
  }, [id]);

  const routeCoords: [number, number][] = (activity?.raw_data?.route_coordinates || [])
    .map(c => [c.lat, c.lon] as [number, number]);
  const mapCenter: [number, number] = routeCoords.length > 0
    ? routeCoords[Math.floor(routeCoords.length / 2)]
    : [40.7128, -74.006];

  return (
    <AppLayout role={role || undefined} name={profile?.name} onLogout={clearAuth}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px' }}>

        {/* Back */}
        <button
          onClick={() => nav('/athlete/runs')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 20 }}
        >
          ← Back to Runs
        </button>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div style={{ color: '#ff6b6b', textAlign: 'center', padding: '48px 0' }}>{error}</div>
        ) : activity ? (
          <>
            {/* Run name + date */}
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, marginBottom: 4 }}>
                {activity.name || 'Run'}
              </h1>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                {fmtDate(activity.start_date)}
              </div>
            </div>

            {/* Map — only shown for manual runs with recorded coordinates */}
            {routeCoords.length > 1 && (
              <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 20, height: 260 }}>
                <MapContainer
                  center={mapCenter}
                  zoom={15}
                  style={{ width: '100%', height: '100%' }}
                  zoomControl={false}
                  attributionControl={false}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    maxNativeZoom={19}
                    maxZoom={20}
                  />
                  {/* Glow layer */}
                  <Polyline positions={routeCoords} color="#00E5A0" weight={10} opacity={0.2} />
                  {/* Solid line */}
                  <Polyline positions={routeCoords} color="#00E5A0" weight={4}  opacity={1}   />
                </MapContainer>
              </div>
            )}

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <DStat label="Distance"    value={`${fmtMiles(activity.distance_meters)} mi`}          accent />
              <DStat label="Moving Time" value={fmtTime(activity.moving_time_seconds)}                      />
              <DStat label="Avg Pace"    value={fmtPace(activity.average_speed)}                           />
              {activity.elapsed_time_seconds != null && (
                <DStat label="Elapsed Time" value={fmtTime(activity.elapsed_time_seconds)} />
              )}
              {activity.average_heartrate != null && (
                <DStat label="Avg Heart Rate" value={`${Math.round(activity.average_heartrate)} bpm`} />
              )}
              {activity.max_heartrate != null && (
                <DStat label="Max Heart Rate" value={`${Math.round(activity.max_heartrate)} bpm`} />
              )}
              {activity.total_elevation_gain > 0 && (
                <DStat label="Elevation Gain" value={`${Math.round(activity.total_elevation_gain * 3.28084)} ft`} />
              )}
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}

function DStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent ? 'rgba(0,229,160,0.25)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: accent ? '#00E5A0' : 'var(--color-text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
