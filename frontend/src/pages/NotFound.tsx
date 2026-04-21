import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function NotFound() {
  const nav = useNavigate();
  const { role } = useAuthStore();

  const home = role === 'coach' ? '/coach/dashboard' : role === 'athlete' ? '/athlete/dashboard' : '/';

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
        fontFamily: "'DM Sans', sans-serif",
        color: '#fff',
        textAlign: 'center',
      }}
    >
      {/* Large muted 404 */}
      <div
        style={{
          fontSize: 'clamp(96px, 20vw, 180px)',
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: '-0.04em',
          color: 'rgba(255,255,255,0.04)',
          userSelect: 'none',
          marginBottom: -8,
        }}
      >
        404
      </div>

      {/* Accent divider */}
      <div style={{ width: 40, height: 3, background: '#00E5A0', borderRadius: 2, margin: '24px auto 20px' }} />

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px', color: '#fff' }}>
        Page not found
      </h1>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', maxWidth: 320, lineHeight: 1.65, margin: '0 auto 32px' }}>
        That URL doesn't exist. It may have been moved, deleted, or you may have followed a broken link.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => nav(-1)}
          style={{
            padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)',
            border: '1px solid rgba(255,255,255,0.10)', cursor: 'pointer',
          }}
        >
          ← Go back
        </button>
        <button
          type="button"
          onClick={() => nav(home)}
          style={{
            padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: '#00E5A0', color: '#000',
            border: 'none', cursor: 'pointer',
          }}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}
