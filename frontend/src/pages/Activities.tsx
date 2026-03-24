import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Navbar, Card, Badge, Spinner, Button, EmptyState } from '../components/ui';

interface Activity {
  id: string;
  activity_type: string;
  name: string;
  start_date: string;
  distance_meters: number;
  moving_time_seconds: number;
  average_heartrate: number | null;
  max_heartrate: number | null;
  total_elevation_gain: number;
  average_speed: number;
  source: string;
}

interface ActivitiesResponse {
  activities: Activity[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

function formatPace(speedMs: number): string {
  if (!speedMs || speedMs === 0) return '--';
  // speed is m/s, convert to min/mile
  const paceSecondsPerMile = 1609.34 / speedMs;
  const mins = Math.floor(paceSecondsPerMile / 60);
  const secs = Math.round(paceSecondsPerMile % 60);
  return `${mins}:${secs.toString().padStart(2, '0')} /mi`;
}

function formatDistance(meters: number): string {
  if (!meters) return '--';
  const miles = meters / 1609.34;
  return `${miles.toFixed(2)} mi`;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function activityColor(type: string): 'green' | 'blue' | 'amber' | 'purple' | 'gray' {
  const t = type.toLowerCase();
  if (t.includes('run')) return 'green';
  if (t.includes('ride') || t.includes('cycle')) return 'blue';
  if (t.includes('swim')) return 'purple';
  if (t.includes('walk') || t.includes('hike')) return 'amber';
  return 'gray';
}

export function Activities() {
  const { role, profile, clearAuth } = useAuthStore();
  const [data, setData] = useState<ActivitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchActivities(page);
  }, [page]);

  async function fetchActivities(p: number) {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/athlete/activities?page=${p}&per_page=20`);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role={role || undefined} name={profile?.name} onLogout={clearAuth} />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-bold">Activities</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : !data || data.activities.length === 0 ? (
          <EmptyState
            title="No activities yet"
            message="Connect your Strava account in Settings to sync your running activities."
            action={
              <Button onClick={() => (window.location.href = '/athlete/settings')}>
                Go to Settings
              </Button>
            }
          />
        ) : (
          <>
            <div className="space-y-3">
              {data.activities.map((a) => (
                <Card key={a.id} className="!p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge label={a.activity_type} color={activityColor(a.activity_type)} />
                        <span className="text-xs text-[var(--muted)]">
                          {new Date(a.start_date).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                      <h3 className="font-medium text-sm text-[var(--text)] truncate">
                        {a.name || 'Untitled Activity'}
                      </h3>
                    </div>
                    <Badge label={a.source} color="gray" />
                  </div>

                  <div className="grid grid-cols-4 gap-4 mt-3 text-center">
                    <div>
                      <span className="block text-xs text-[var(--muted)]">Distance</span>
                      <span className="text-sm font-medium text-[var(--text)]">
                        {formatDistance(a.distance_meters)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-[var(--muted)]">Pace</span>
                      <span className="text-sm font-medium text-[var(--text)]">
                        {formatPace(a.average_speed)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-[var(--muted)]">Duration</span>
                      <span className="text-sm font-medium text-[var(--text)]">
                        {formatDuration(a.moving_time_seconds)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-[var(--muted)]">HR</span>
                      <span className="text-sm font-medium text-[var(--text)]">
                        {a.average_heartrate ? `${Math.round(a.average_heartrate)} bpm` : '--'}
                      </span>
                    </div>
                  </div>

                  {a.total_elevation_gain > 0 && (
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      Elevation: +{Math.round(a.total_elevation_gain * 3.28084)} ft
                    </div>
                  )}
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {data.total_pages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-[var(--muted)]">
                  Page {data.page} of {data.total_pages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= data.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
