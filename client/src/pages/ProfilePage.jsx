import { useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../auth.jsx';

const GLYPHS = [
  '🏋️','🤸','🧘','🚴','🏃','💪','🥊','🏊',
  '🧗','🎯','🏆','🌟','🔥','⚡','💎','🦁',
  '🐯','🦊','🦅','🐺','🌙','☀️','🌊','🌿',
];

const field = {
  padding: '0.75rem 0.85rem', minHeight: '46px',
  border: '1px solid var(--border)', borderRadius: '8px',
  background: 'var(--input-bg)', color: 'var(--text)', fontSize: '16px',
  width: '100%', boxSizing: 'border-box',
};
const label = {
  display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.4rem',
  fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em',
};

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name,      setName]      = useState(user?.name  ?? '');
  const [glyph,     setGlyph]     = useState(user?.glyph ?? '🏋️');
  const [curPw,     setCurPw]     = useState('');
  const [newPw,     setNewPw]     = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (newPw && newPw !== confirmPw) { setError('New passwords do not match'); return; }
    if (newPw && newPw.length < 8)   { setError('New password must be at least 8 characters'); return; }

    const body = {};
    if (name.trim() !== user.name) body.name  = name.trim();
    if (glyph !== user.glyph)      body.glyph = glyph;
    if (newPw) { body.current_password = curPw; body.new_password = newPw; }

    if (!Object.keys(body).length) { setSuccess('Nothing to update.'); return; }

    setSaving(true);
    try {
      const updated = await api.updateProfile(body);
      setUser(updated);
      setSuccess('Profile updated.');
      setCurPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      const msg = err.message ?? '';
      setError(msg.includes('401') ? 'Incorrect current password'
             : msg.includes('400') ? 'Please check your inputs'
             : 'Something went wrong — try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, color: 'var(--text)' }}>Profile</h2>
      <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: 'var(--dim)' }}>
        @{user?.username}
      </p>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '420px' }}>

        {/* Avatar */}
        <div>
          <span style={label}>Avatar</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
            {GLYPHS.map(g => (
              <button key={g} type="button" onClick={() => setGlyph(g)} style={{
                aspectRatio: '1 / 1',
                minHeight: '44px',
                border: `2px solid ${glyph === g ? 'var(--text)' : 'var(--border)'}`,
                borderRadius: '8px', background: glyph === g ? 'var(--surface3)' : 'var(--surface2)',
                fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.1s, background 0.1s',
              }}>{g}</button>
            ))}
          </div>
        </div>

        {/* Display name */}
        <div>
          <label style={label}>Display name</label>
          <input value={name} onChange={e => setName(e.target.value)} style={field} required />
        </div>

        {/* Password change */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--dim)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Change password</p>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Leave blank to keep your current password.</p>
          <div>
            <label style={label}>Current password</label>
            <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} autoComplete="current-password" style={field} />
          </div>
          <div>
            <label style={label}>New password</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" style={field} />
          </div>
          <div>
            <label style={label}>Confirm new password</label>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} autoComplete="new-password" style={field} />
          </div>
        </div>

        {error && (
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--danger)', background: '#2a1010', border: '1px solid #4a1a1a', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>{error}</p>
        )}
        {success && (
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--success)', background: '#0e2a0e', border: '1px solid #1a4a1a', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>{success}</p>
        )}

        <button type="submit" disabled={saving} style={{
          padding: '0.95rem', minHeight: '48px',
          background: 'var(--btn)', color: 'var(--btn-text)',
          border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '1rem',
          cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
