import { useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../auth.jsx';

const GLYPHS = [
  '🏋️','🤸','🧘','🚴','🏃','💪','🥊','🏊',
  '🧗','🎯','🏆','🌟','🔥','⚡','💎','🦁',
  '🐯','🦊','🦅','🐺','🌙','☀️','🌊','🌿',
];

const field = {
  padding: '0.55rem 0.75rem',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '1rem',
  width: '100%',
  boxSizing: 'border-box',
};

export default function AuthPage() {
  const { setUser } = useAuth();
  const [tab, setTab]           = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [name, setName]         = useState('');
  const [glyph, setGlyph]       = useState('🏋️');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  function switchTab(t) { setTab(t); setError(''); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (tab === 'register' && password !== confirm) {
      setError('Passwords do not match'); return;
    }
    setBusy(true);
    try {
      const user = tab === 'login'
        ? await api.login({ username, password })
        : await api.register({ username, password, name, glyph });
      setUser(user);
    } catch (err) {
      const msg = err.message ?? '';
      // Try to extract the server error message from the response
      setError(msg.includes('409') ? 'Username already taken'
             : msg.includes('401') ? 'Invalid username or password'
             : msg.includes('400') ? 'Please fill in all required fields'
             : 'Something went wrong — try again');
    } finally {
      setBusy(false);
    }
  }

  const tabBtn = (t, label) => (
    <button type="button" onClick={() => switchTab(t)} style={{
      flex: 1, padding: '0.6rem', background: 'none', border: 'none',
      borderBottom: `2px solid ${tab === t ? 'var(--text)' : 'transparent'}`,
      color: tab === t ? 'var(--text)' : 'var(--muted)',
      fontWeight: tab === t ? '700' : 'normal',
      fontSize: '0.95rem', cursor: 'pointer',
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏋️</div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: 'var(--text)' }}>FitnessTrack</h1>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {tabBtn('login', 'Log in')}
            {tabBtn('register', 'Register')}
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {tab === 'register' && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your name</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alex" style={field} required />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.5rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Choose a glyph</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
                    {GLYPHS.map(g => (
                      <button key={g} type="button" onClick={() => setGlyph(g)} style={{
                        padding: '6px', border: `2px solid ${glyph === g ? 'var(--text)' : 'var(--border)'}`,
                        borderRadius: '8px', background: glyph === g ? 'var(--surface3)' : 'var(--surface2)',
                        fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1,
                        transition: 'border-color 0.1s, background 0.1s',
                      }}>{g}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. alex" autoCapitalize="off" autoComplete="username" style={field} required />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} style={field} required />
            </div>

            {tab === 'register' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirm password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" style={field} required />
              </div>
            )}

            {error && (
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--danger)', background: '#2a1010', border: '1px solid #4a1a1a', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>{error}</p>
            )}

            <button type="submit" disabled={busy} style={{
              padding: '0.75rem', background: 'var(--btn)', color: 'var(--btn-text)',
              border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '1rem',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, marginTop: '0.25rem',
            }}>
              {busy ? '…' : tab === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
