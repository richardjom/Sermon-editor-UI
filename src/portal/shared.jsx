import React, { useEffect, useState } from 'react'

// ── Theme ───────────────────────────────────────────────────────────────────
// Starts from the device's light/dark setting; the header toggle overrides it
// and the choice is remembered on this device.
const THEME_KEY = 'portal:theme'

function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {}
  return 'light'
}

export function usePortalTheme() {
  const [theme, setTheme] = useState(initialTheme)
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme) } catch {}
  }, [theme])
  return [theme, () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))]
}

// ── Clip helpers ────────────────────────────────────────────────────────────
// No review row = the church hasn't decided yet.
export function clipStatus(clip) {
  return clip.review?.status || 'needs'
}

export const STATUS_LABEL = {
  needs: 'Needs review',
  approved: 'Approved',
  changes: 'Being updated',
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

export function fmtDate(sermon) {
  const raw = sermon?.service_datetime || sermon?.sermon_date
  if (!raw) return ''
  // A bare YYYY-MM-DD would parse as UTC midnight and show the previous
  // day in US time zones, so read it as a local date.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw))
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw)
  if (isNaN(d)) return String(raw)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// Hashtags written into the caption, shown as chips / a tag line.
export function hashtags(caption) {
  return [...new Set((caption || '').match(/#[\p{L}\p{N}_]+/gu) || [])]
}

export function captionWithoutTags(caption) {
  return (caption || '').replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '').trim()
}

// ── Icons (inline stroke SVG, currentColor) ─────────────────────────────────
const paths = {
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  check: <path d="M5 12l5 5L20 7" />,
  download: <><path d="M12 4v12" /><path d="M6 10l6 6 6-6" /><path d="M4 20h16" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  clips: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9.5v5l4-2.5z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
}

export function PIcon({ name, size = 16, strokeWidth = 2 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export function ThemeToggle({ theme, onToggle }) {
  const dark = theme === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button type="button" className="pt-toggle" onClick={onToggle} aria-label={label} title={label}>
      <span className={dark ? '' : 'on'}><PIcon name="sun" /></span>
      <span className={dark ? 'on' : ''}><PIcon name="moon" /></span>
    </button>
  )
}
