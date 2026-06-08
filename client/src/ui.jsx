// Shared UI primitives used across pages. Lives outside App.jsx so leaf pages
// (e.g. AuthPage) can pull the logo without importing App.jsx back — which
// previously formed an App ↔ AuthPage import cycle.

// ── Barbell logo ──────────────────────────────────────────────────────────────

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

// ── Avatar glyph picker ───────────────────────────────────────────────────────

const GLYPHS = [
  '🏋️','🤸','🧘','🚴','🏃','💪','🥊','🏊',
  '🧗','🎯','🏆','🌟','🔥','⚡','💎','🦁',
  '🐯','🦊','🦅','🐺','🌙','☀️','🌊','🌿',
];

export function GlyphPicker({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
      {GLYPHS.map(g => (
        <button key={g} type="button" onClick={() => onChange(g)} style={{
          aspectRatio: '1 / 1',
          minHeight: '44px',
          border: `2px solid ${value === g ? 'var(--text)' : 'var(--border)'}`,
          borderRadius: '8px',
          background: value === g ? 'var(--surface3)' : 'var(--surface2)',
          fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.1s, background 0.1s',
        }}>{g}</button>
      ))}
    </div>
  );
}

// ── Shared form input style ───────────────────────────────────────────────────

export const field = {
  padding: '0.75rem 0.85rem',
  minHeight: '46px',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '16px',
  width: '100%',
  boxSizing: 'border-box',
};
