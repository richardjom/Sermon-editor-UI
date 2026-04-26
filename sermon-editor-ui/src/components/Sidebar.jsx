import React from 'react'

const CLIENT_COLORS = [
  '#b5d4f4', '#9fe1cb', '#fac775', '#f4c0d1', '#c0dd97', '#f0997b',
]

export function Sidebar({ clients, currentPage, currentClientId, onNavigate, onAddClient }) {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>
        <div style={styles.logoMark}>SC</div>
        <div>
          <div style={styles.logoTitle}>The Editor</div>
          <div style={styles.logoSub}>Sunday Cues</div>
        </div>
      </div>

      <nav style={styles.nav}>
        <div style={styles.navSection}>
          <NavItem
            label="Dashboard"
            icon={<GridIcon />}
            active={currentPage === 'dashboard'}
            onClick={() => onNavigate('dashboard')}
          />
          <NavItem
            label="All Sermons"
            icon={<DocIcon />}
            active={currentPage === 'sermons'}
            onClick={() => onNavigate('sermons')}
          />
        </div>

        <div style={styles.navSection}>
          <div style={styles.sectionLabel}>Clients</div>
          {clients.map((c, i) => (
            <NavItem
              key={c.id}
              label={c.name}
              icon={<span style={{ ...styles.dot, background: CLIENT_COLORS[i % CLIENT_COLORS.length] }} />}
              active={currentPage === 'client' && currentClientId === c.id}
              onClick={() => onNavigate('client', c.id)}
            />
          ))}
          <button style={styles.addClientBtn} onClick={onAddClient}>
            <span style={styles.plusIcon}>+</span>
            Add client
          </button>
        </div>
      </nav>
    </aside>
  )
}

function NavItem({ label, icon, active, onClick }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <button
      style={{
        ...styles.navItem,
        ...(active || hovered ? styles.navItemActive : {}),
        fontWeight: active ? 500 : 400,
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={styles.navIcon}>{icon}</span>
      {label}
    </button>
  )
}

function GridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.7" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 6h6M5 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

const styles = {
  sidebar: {
    width: 220,
    minWidth: 220,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'sticky',
    top: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '1.25rem',
    borderBottom: '1px solid var(--border)',
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'var(--text)',
    color: 'var(--surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    flexShrink: 0,
  },
  logoTitle: { fontSize: 14, fontWeight: 500, color: 'var(--text)' },
  logoSub: { fontSize: 11, color: 'var(--text-3)', marginTop: 1 },
  nav: { padding: '1rem 0.75rem', flex: 1, overflowY: 'auto' },
  navSection: { marginBottom: '1.5rem' },
  sectionLabel: {
    fontSize: 10,
    color: 'var(--text-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '0 0.5rem',
    marginBottom: '0.4rem',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '7px 10px',
    borderRadius: 7,
    fontSize: 13,
    color: 'var(--text-2)',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    transition: 'background 0.12s, color 0.12s',
  },
  navItemActive: {
    background: 'var(--surface-2)',
    color: 'var(--text)',
  },
  navIcon: { width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'block', flexShrink: 0 },
  addClientBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '7px 10px',
    borderRadius: 7,
    fontSize: 13,
    color: 'var(--text-3)',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    transition: 'color 0.12s',
  },
  plusIcon: { fontSize: 16, lineHeight: 1 },
}
