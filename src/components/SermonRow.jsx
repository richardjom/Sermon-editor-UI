import React, { useState } from 'react'
import { Badge } from './ui.jsx'

export function SermonRow({ sermon, onClick, onDelete }) {
  const [hover, setHover] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const date = sermon.sermon_date
    ? new Date(sermon.sermon_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  const meta = [sermon._clientName, date].filter(Boolean).join(' · ')
  const clips = sermon.clips_found ? `${sermon.clips_found} clip${sermon.clips_found !== 1 ? 's' : ''}` : null

  async function handleDeleteClick(e) {
    e.stopPropagation()
    if (deleting || !onDelete) return
    const label = sermon.sermon_title || sermon.sermon_id
    const ok = window.confirm(
      `Delete "${label}"?\n\nThis removes the sermon, its clips, and the source video / audio / rendered clips from storage. Notion pages stay. This cannot be undone.`
    )
    if (!ok) return
    setDeleting(true)
    try {
      await onDelete(sermon)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 1.25rem',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 0.1s',
        opacity: deleting ? 0.5 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; setHover(true) }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; setHover(false) }}
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
      {onDelete && (
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={deleting}
          title={deleting ? 'Deleting…' : 'Delete sermon'}
          aria-label="Delete sermon"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: deleting ? 'wait' : 'pointer',
            padding: 6,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Always visible — faint when the row isn't hovered, full
            // opacity when it is. Hover-only-reveal made the button
            // invisible to users who didn't know to look for it.
            opacity: deleting ? 1 : (hover ? 1 : 0.55),
            transition: 'opacity 0.1s, background 0.1s, color 0.1s',
            color: 'var(--text-3)',
            marginLeft: 4,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'; e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M6 4V2.5A.5.5 0 016.5 2h3a.5.5 0 01.5.5V4M5 4l.7 9a1 1 0 001 .9h2.6a1 1 0 001-.9L11 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 4, flexShrink: 0 }}>
        <path d="M6 4l4 4-4 4" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}
