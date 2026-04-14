import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getToken, setToken } from './lib/api';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Users from './pages/Users';
import Activity from './pages/Activity';
import Revenue from './pages/Revenue';

const NAV = [
  { path: '/overview', label: 'Overview', icon: '◈' },
  { path: '/users', label: 'Users', icon: '⚉' },
  { path: '/activity', label: 'Activity', icon: '⟳' },
  { path: '/revenue', label: 'Revenue', icon: '$' },
];

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  function logout() {
    setToken(null);
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Sidebar */}
      <nav style={{
        width: 200, flexShrink: 0, background: '#111', borderRight: '1px solid #222',
        display: 'flex', flexDirection: 'column', padding: '24px 0',
      }}>
        <div style={{ padding: '0 20px 28px', fontSize: 15, fontWeight: 700, color: '#00E5A0', letterSpacing: -0.5 }}>
          Laktic Admin
        </div>
        {NAV.map(n => (
          <NavLink key={n.path} to={n.path} style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
            color: isActive ? '#fff' : '#666', textDecoration: 'none', fontSize: 14,
            fontWeight: isActive ? 600 : 400,
            background: isActive ? '#1a1a1a' : 'transparent',
            borderLeft: isActive ? '2px solid #00E5A0' : '2px solid transparent',
            transition: 'color 120ms, background 120ms',
          })}>
            <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={logout} style={{
          margin: '0 12px', padding: '8px 14px', background: 'transparent',
          border: '1px solid #333', borderRadius: 6, color: '#555', cursor: 'pointer',
          fontSize: 13, textAlign: 'left',
        }}>
          Sign out
        </button>
      </nav>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '32px 36px' }}>
        {children}
      </main>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const [, forceUpdate] = useState(0);

  // Re-render after login so RequireAuth picks up the new token
  function onLogin() { forceUpdate(n => n + 1); }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login onLogin={onLogin} />} />
        <Route path="/overview" element={<RequireAuth><Shell><Overview /></Shell></RequireAuth>} />
        <Route path="/users" element={<RequireAuth><Shell><Users /></Shell></RequireAuth>} />
        <Route path="/activity" element={<RequireAuth><Shell><Activity /></Shell></RequireAuth>} />
        <Route path="/revenue" element={<RequireAuth><Shell><Revenue /></Shell></RequireAuth>} />
        <Route path="*" element={<Navigate to={getToken() ? '/overview' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
