import React from 'react'

export function Badge({ status }) {
  const map = {
    completed: { bg: 'var(--green-bg)', color: 'var(--green-text)', label: 'Completed' },
    processing: { bg: 'var(--amber-bg)', color: 'var(--amber-text)', label: 'Processing' },
    failed: { bg: 'var(--red-bg)', color: 'var(--red-text)', label: 'Failed' },
    high: { bg: 'var(--green-bg)', color: 'var(--green-text)', label: 'High' },
    medium: { bg: 'var(--amber-bg)', color: 'var(--amber-text)', label: 'Medium' },
    low: { bg: 'var(--surface-2)', color: 'var(--text-2)', label: 'Low' },
  }
  const s = map[status?.toLowerCase()] || { bg: 'var(--surface-2)', color: 'var(--text-2)', label: status || 'Unknown' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 500,
      background: s.bg, color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

export function Btn({ children, primary, onClick, disabled, small, style }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: small ? '5px 12px' : '8px 16px',
        borderRadius: 8, fontSize: small ? 12 : 13, fontWeight: 500,
        border: primary ? 'none' : '1px solid var(--border-mid)',
        background: primary
          ? hovered ? '#333' : 'var(--text)'
          : hovered ? 'var(--surface-2)' : 'var(--surface)',
        color: primary ? '#fff' : 'var(--text)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        transition: 'background 0.12s',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function Spinner({ size = 16 }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      border: `2px solid var(--border-mid)`,
      borderTopColor: 'var(--text-2)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

export function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardHeader({ title, action }) {
  return (
    <div style={{
      padding: '1rem 1.25rem',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{title}</span>
      {action}
    </div>
  )
}

export function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: 'var(--surface-2)', borderRadius: 8, padding: '1rem',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export function EmptyState({ message }) {
  return (
    <div style={{ padding: '3rem 1.25rem', textAlign: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{message}</p>
    </div>
  )
}

export function Topbar({ title, sub, action }) {
  return (
    <div style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '1rem 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

export function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)',
        borderRadius: 12, border: '1px solid var(--border)',
        width: 520, maxWidth: '95vw',
        animation: 'slideUp 0.18s ease',
      }}>
        <div style={{
          padding: '1.25rem', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, color: 'var(--text-2)',
            cursor: 'pointer', padding: '0 4px', lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ padding: '1.25rem' }}>{children}</div>
        {footer && (
          <div style={{
            padding: '1rem 1.25rem', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end', gap: 8,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function FormGroup({ label, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function Input({ ...props }) {
  return (
    <input {...props} style={{
      width: '100%', padding: '8px 10px',
      borderRadius: 8, border: '1px solid var(--border-mid)',
      background: 'var(--surface)', color: 'var(--text)',
      fontSize: 13, outline: 'none',
      ...props.style,
    }} />
  )
}

export function Select({ children, ...props }) {
  return (
    <select {...props} style={{
      width: '100%', padding: '8px 10px',
      borderRadius: 8, border: '1px solid var(--border-mid)',
      background: 'var(--surface)', color: 'var(--text)',
      fontSize: 13, outline: 'none',
      ...props.style,
    }}>
      {children}
    </select>
  )
}

export const globalStyles = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideUp { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`
