import React from 'react'
import { Badge } from './ui.jsx'

export function SermonRow({ sermon, onClick }) {
  const date = sermon.sermon_date
    ? new Date(sermon.sermon_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  const meta = [sermon._clientName, date].filter(Boolean).join(' · ')
  const clips = sermon.clips_found ? `${sermon.clips_found} clip${sermon.clips_found !== 1 ? 's' : ''}` : null

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 1.25rem',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 7,
        background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="var(--text-3)" strokeWidth="1.2" />
          <path d="M5 6h6M5 8.5h4" stroke="var(--text-3)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sermon.sermon_title || sermon.sermon_id}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
          {[meta, clips].filter(Boolean).join(' · ')}
        </div>
      </div>
      <Badge status={sermon.status} />
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 4, flexShrink: 0 }}>
        <path d="M6 4l4 4-4 4" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}
