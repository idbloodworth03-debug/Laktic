/**
 * StravaConnectButton — Official Strava brand-compliant OAuth button.
 *
 * Per Strava brand guidelines:
 *  - Uses Strava orange #FC5200 on light surfaces
 *  - Includes the Strava chevron/lightning "S" icon
 *  - Text must read "Connect with Strava"
 *  - Do not alter proportions, colors, or icon
 *
 * If you have access to Strava's official PNG button, place it at
 * /public/strava-connect.png and swap the <img> tag back in.
 */

interface StravaConnectButtonProps {
  onClick: () => void;
  loading?: boolean;
  className?: string;
}

export function StravaConnectButton({ onClick, loading = false, className = '' }: StravaConnectButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-3 px-5 py-3 rounded-md font-semibold text-white text-sm select-none transition-opacity disabled:opacity-60 ${className}`}
      style={{ background: '#FC5200', minWidth: 220 }}
      aria-label="Connect with Strava"
    >
      {/* Strava "S" lightning-bolt chevron icon — SVG approximation of official mark */}
      {loading ? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="animate-spin">
          <circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
          <path d="M10 2a8 8 0 0 1 8 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          {/* Strava chevron "S" — two ascending/descending triangles */}
          <path d="M12 3l-4 7h3L7 17l8-9h-4L12 3z" fill="white" />
        </svg>
      )}
      <span>{loading ? 'Connecting…' : 'Connect with Strava'}</span>
    </button>
  );
}
