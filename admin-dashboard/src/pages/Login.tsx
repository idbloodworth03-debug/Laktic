import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../lib/api';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Login failed');
      const token = body.session?.access_token ?? body.access_token ?? body.token;
      if (!token) throw new Error('No token in response');
      setToken(token);
      onLogin();
      navigate('/overview', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <form onSubmit={submit} style={{
        width: 340, background: '#111', border: '1px solid #222',
        borderRadius: 12, padding: '36px 32px',
      }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#00E5A0', marginBottom: 4 }}>Laktic Admin</div>
          <div style={{ fontSize: 13, color: '#555' }}>Sign in with your admin account</div>
        </div>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>Email</span>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            style={inputStyle} placeholder="admin@laktic.com"
          />
        </label>

        <label style={{ display: 'block', marginBottom: 24 }}>
          <span style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>Password</span>
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            style={inputStyle} placeholder="••••••••"
          />
        </label>

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '11px 0', background: loading ? '#0a8c62' : '#00E5A0',
          color: '#000', fontWeight: 700, fontSize: 14, border: 'none',
          borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: '#1a1a1a',
  border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff',
  fontSize: 14, outline: 'none',
};
