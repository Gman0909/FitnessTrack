import { Routes, Route, NavLink } from 'react-router-dom';
import TodayPage      from './pages/TodayPage.jsx';
import PlansPage      from './pages/PlansPage.jsx';
import PlanDetailPage from './pages/PlanDetailPage.jsx';
import AuthPage       from './pages/AuthPage.jsx';
import { HistoryPage, SetupPage } from './pages/stubs.jsx';
import { UnitContext, useUnitProvider } from './units.js';
import { AuthProvider, useAuth } from './auth.jsx';
import { api } from './api/index.js';

const linkStyle = ({ isActive }) => ({
  fontWeight: isActive ? '600' : 'normal',
  textDecoration: 'none',
  color: isActive ? 'var(--text)' : 'var(--muted)',
  padding: '0.5rem 0.75rem',
  borderBottom: isActive ? '2px solid var(--text)' : '2px solid transparent',
  whiteSpace: 'nowrap',
});

function AppShell() {
  const unitCtx      = useUnitProvider();
  const { user, setUser } = useAuth();

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

  return (
    <UnitContext.Provider value={unitCtx}>
      <nav style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--surface)', overflowX: 'auto' }}>
        <NavLink to="/"        end style={linkStyle}>Workout</NavLink>
        <NavLink to="/schedule"    style={linkStyle}>Plans</NavLink>
        <NavLink to="/history"     style={linkStyle}>History</NavLink>
        <NavLink to="/setup"       style={linkStyle}>Setup</NavLink>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingRight: '0.75rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }} title={user.name}>{user.glyph}</span>
            <button onClick={handleLogout}
              style={{ padding: '0.25rem 0.5rem', border: '1px solid var(--border)', borderRadius: '4px', background: 'none', fontSize: '0.75rem', color: 'var(--dim)', cursor: 'pointer' }}>
              Log out
            </button>
          </div>
        </div>
      </nav>
      <main style={{ padding: '1rem', maxWidth: '640px', margin: '0 auto' }}>
        <Routes>
          <Route path="/"             element={<TodayPage />} />
          <Route path="/schedule"     element={<PlansPage />} />
          <Route path="/schedule/:id" element={<PlanDetailPage />} />
          <Route path="/history"      element={<HistoryPage />} />
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
