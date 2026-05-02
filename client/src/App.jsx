import { useState, useEffect, useRef } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import TodayPage      from './pages/TodayPage.jsx';
import PlansPage      from './pages/PlansPage.jsx';
import PlanDetailPage from './pages/PlanDetailPage.jsx';
import AuthPage       from './pages/AuthPage.jsx';
import ProfilePage    from './pages/ProfilePage.jsx';
import { SetupPage }  from './pages/stubs.jsx';
import { StatsPage }  from './pages/StatsPage.jsx';
import { UnitContext, useUnitProvider } from './units.js';
import { AuthProvider, useAuth } from './auth.jsx';
import { api } from './api/index.js';

// ── Shared barbell logo ───────────────────────────────────────────────────────

export function BarbellLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1"  y="7"   width="3"  height="10" rx="1.5" fill="#f0a030"/>
      <rect x="4"  y="9.5" width="2"  height="5"  rx="0.75" fill="#f0a030"/>
      <rect x="6"  y="11"  width="12" height="2"  rx="1"   fill="#f0a030"/>
      <rect x="18" y="9.5" width="2"  height="5"  rx="0.75" fill="#f0a030"/>
      <rect x="20" y="7"   width="3"  height="10" rx="1.5" fill="#f0a030"/>
    </svg>
  );
}

// ── Nav link style ────────────────────────────────────────────────────────────

const linkStyle = ({ isActive }) => ({
  fontWeight: isActive ? '600' : 'normal',
  textDecoration: 'none',
  color: isActive ? 'var(--text)' : 'var(--muted)',
  padding: '0.85rem 1rem',
  minHeight: '44px',
  display: 'flex',
  alignItems: 'center',
  borderBottom: isActive ? '2px solid var(--text)' : '2px solid transparent',
  whiteSpace: 'nowrap',
  fontSize: '0.95rem',
});

// ── App shell ─────────────────────────────────────────────────────────────────

function AppShell() {
  const unitCtx           = useUnitProvider();
  const { user, setUser } = useAuth();
  const navigate          = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function close(e) { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  if (user === undefined) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading…</p>
    </div>
  );

  if (!user) return <AuthPage />;

  async function handleLogout() {
    await api.logout();
    setUser(null);
  }

  const menuItemStyle = {
    display: 'flex', alignItems: 'center', width: '100%',
    padding: '0.85rem 1rem', minHeight: '48px',
    background: 'none', border: 'none', textAlign: 'left',
    fontSize: '0.95rem', cursor: 'pointer', color: 'var(--text)',
    textDecoration: 'none',
  };

  return (
    <UnitContext.Provider value={unitCtx}>

      {/* Brand header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
        <BarbellLogo size={22} />
        <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text)', letterSpacing: '-0.01em' }}>FitnessTrack</span>
      </div>

      {/* Nav bar */}
      <nav style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', overflowX: 'auto', flex: 1 }}>
          <NavLink to="/"         end style={linkStyle}>Workout</NavLink>
          <NavLink to="/schedule"     style={linkStyle}>Plans</NavLink>
          <NavLink to="/stats"        style={linkStyle}>Stats</NavLink>
        </div>

        {/* User dropdown */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Account menu"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'none', border: 'none', color: 'var(--text)',
              cursor: 'pointer', padding: '0.6rem 0.85rem', minHeight: '44px',
              fontSize: '0.9rem',
            }}
          >
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{user.glyph}</span>
            <span style={{ fontWeight: '500', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, transition: 'transform 0.15s', transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--muted)' }}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 2px)',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: '8px', overflow: 'hidden',
              zIndex: 50, minWidth: '180px',
              boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
            }}>
              <NavLink to="/profile" onClick={() => setMenuOpen(false)} style={{ ...menuItemStyle, borderBottom: '1px solid var(--border)' }}>Profile</NavLink>
              <NavLink to="/setup"   onClick={() => setMenuOpen(false)} style={{ ...menuItemStyle, borderBottom: '1px solid var(--border)' }}>Setup</NavLink>
              <button onClick={() => { handleLogout(); setMenuOpen(false); }} style={{ ...menuItemStyle, color: 'var(--danger)' }}>Log out</button>
            </div>
          )}
        </div>
      </nav>

      <main style={{ padding: '1rem', maxWidth: '640px', margin: '0 auto' }}>
        <Routes>
          <Route path="/"             element={<TodayPage />} />
          <Route path="/schedule"     element={<PlansPage />} />
          <Route path="/schedule/:id" element={<PlanDetailPage />} />
          <Route path="/stats"        element={<StatsPage />} />
          <Route path="/profile"      element={<ProfilePage />} />
          <Route path="/setup"        element={<SetupPage />} />
        </Routes>
      </main>
    </UnitContext.Provider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
