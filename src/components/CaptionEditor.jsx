import React, { useState, useRef, useEffect, useMemo } from 'react'

/* ============================================================================
 * Caption editor — live preview of position / outline / font / casing.
 *
 * The preview is a live HTML overlay on the source <video>; tweaking is
 * instant (no server render). The expensive ffmpeg burn happens once on
 * "Apply & render". This only changes caption STYLING — never A/V sync or
 * caption timing. Overrides are optional params on the existing render
 * endpoint; if the user never opens this editor, nothing changes.
 *
 * Settings persist per-clip in localStorage.
 * ========================================================================== */

function hmsToSec(ts) {
  if (typeof ts === 'number') return ts
  if (!ts) return 0
  const parts = String(ts).split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(ts) || 0
}

const OUTLINE_PX = { default: null, none: 0, thin: 2, thick: 5 }

// Mirrors backend CAPTION_FONTS (app/services/captions.py). `value` is the
// exact ASS Fontname the render uses; `css`/`weight` drive the live preview.
const FONTS = [
  { value: '', label: 'Keep template font', css: 'Arial, Helvetica, sans-serif', weight: 700 },
  { value: 'Arial', label: 'Helvetica / Arial', css: 'Arial, Helvetica, sans-serif', weight: 700 },
  { value: 'Roboto', label: 'Roboto', css: 'Roboto, sans-serif', weight: 700 },
  { value: 'Open Sans', label: 'Open Sans', css: '"Open Sans", sans-serif', weight: 700 },
  { value: 'Lato', label: 'Lato', css: 'Lato, sans-serif', weight: 700 },
  { value: 'DejaVu Sans', label: 'DejaVu Sans', css: '"DejaVu Sans", Verdana, sans-serif', weight: 700 },
  { value: 'Anton', label: 'Anton — heavy caps', css: 'Anton, sans-serif', weight: 400 },
  { value: 'Bebas Neue', label: 'Bebas Neue — tall caps', css: '"Bebas Neue", sans-serif', weight: 400 },
  { value: 'Liberation Serif', label: 'Times — serif', css: '"Times New Roman", Times, serif', weight: 700 },
  { value: 'EB Garamond', label: 'EB Garamond — elegant serif', css: '"EB Garamond", serif', weight: 500 },
  { value: 'Noto Serif', label: 'Noto Serif', css: '"Noto Serif", serif', weight: 700 },
]

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=EB+Garamond:wght@400;500;600&family=Lato:wght@400;700&family=Noto+Serif:wght@400;700&family=Open+Sans:wght@400;700&family=Roboto:wght@400;700&display=swap'

function ensureFontsLoaded() {
  if (typeof document === 'undefined') return
  if (document.getElementById('caption-editor-fonts')) return
  const link = document.createElement('link')
  link.id = 'caption-editor-fonts'
  link.rel = 'stylesheet'
  link.href = GOOGLE_FONTS_URL
  document.head.appendChild(link)
}

function loadSaved(clipId) {
  try {
    const raw = localStorage.getItem(`captionEdit:${clipId}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function save(clipId, v) {
  try { localStorage.setItem(`captionEdit:${clipId}`, JSON.stringify(v)) } catch {}
}

export function CaptionEditor({ clip, sermon, onRender, onClose, onApplied }) {
  const vertical = !!(sermon?.render_options?.vertical)
  const aspect = vertical ? '9 / 16' : '16 / 9'

  const clipStart = useMemo(() => hmsToSec(clip.start_timestamp), [clip])
  const clipEnd = useMemo(() => hmsToSec(clip.end_timestamp), [clip])

  const sampleText = useMemo(() => {
    const hook = (clip.suggested_hook || '').trim()
    if (hook) return hook
    const t = (clip.transcript || '').trim().split(/\s+/).slice(0, 7).join(' ')
    return t || 'Caption preview'
  }, [clip])

  const saved = loadSaved(clip.id)
  const [position, setPosition] = useState(saved?.position ?? (vertical ? 25 : 11))
  const [outline, setOutline] = useState(saved?.outline ?? 'default')
  const [font, setFont] = useState(saved?.font ?? '')
  const [casing, setCasing] = useState(saved?.casing ?? 'default') // default | natural | caps
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const videoRef = useRef(null)
  const boxRef = useRef(null)
  const [boxH, setBoxH] = useState(420)

  useEffect(() => { ensureFontsLoaded() }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onMeta = () => { try { v.currentTime = clipStart } catch {} }
    const onTime = () => {
      if (v.currentTime >= clipEnd || v.currentTime < clipStart - 0.5) {
        v.currentTime = clipStart
      }
    }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('timeupdate', onTime)
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('timeupdate', onTime)
    }
  }, [clipStart, clipEnd])

  useEffect(() => {
    if (boxRef.current) setBoxH(boxRef.current.clientHeight || 420)
  })

  const fontDef = FONTS.find(f => f.value === font) || FONTS[0]
  const fontSize = Math.max(12, Math.round(boxH * 0.036))
  const outlinePx = OUTLINE_PX[outline]
  const textShadow = (outlinePx === null || outlinePx > 0)
    ? `0 0 ${(outlinePx ?? 3) + 1}px #000, 0 0 ${(outlinePx ?? 3) + 1}px #000, 0 1px 2px rgba(0,0,0,.6)`
    : '0 1px 3px rgba(0,0,0,.55)'
  const textTransform = casing === 'caps' ? 'uppercase' : 'none'

  async function apply() {
    setSubmitting(true); setErr('')
    try {
      const payload = { captionPosition: Number(position) }
      if (OUTLINE_PX[outline] !== null) payload.captionOutline = OUTLINE_PX[outline]
      if (font) payload.captionFont = font
      if (casing === 'caps') payload.captionUppercase = true
      else if (casing === 'natural') payload.captionUppercase = false
      save(clip.id, { position, outline, font, casing })
      await onRender?.(clip.id, payload)
      onApplied?.()
      onClose?.()
    } catch (e) {
      setErr('Could not start render. Check the API is reachable.')
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(20,18,15,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, width: 'min(900px, 96vw)',
        maxHeight: '92vh', overflow: 'auto', display: 'grid',
        gridTemplateColumns: '1.2fr 1fr', gap: 0,
        boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
      }}>
        {/* preview */}
        <div style={{ padding: 18, borderRight: '1px solid #ece8e0' }}>
          <div ref={boxRef} style={{
            position: 'relative', aspectRatio: aspect, background: '#000',
            borderRadius: 10, overflow: 'hidden', margin: '0 auto', maxHeight: '64vh',
          }}>
            {sermon?.source_video_url ? (
              <video ref={videoRef} src={sermon.source_video_url} muted playsInline preload="metadata"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13 }}>No source preview available</div>
            )}
            <div style={{ position: 'absolute', left: '6%', right: '6%', bottom: `${position}%`, textAlign: 'center', pointerEvents: 'none' }}>
              <span style={{
                fontFamily: fontDef.css, fontWeight: fontDef.weight, fontSize,
                lineHeight: 1.15, color: '#fff', textShadow, textTransform,
                WebkitTextStroke: (outlinePx && outlinePx > 0) ? `${Math.max(1, Math.round(outlinePx * 0.6))}px #000` : undefined,
              }}>{sampleText}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
            <button onClick={() => { const v = videoRef.current; if (v) { v.paused ? v.play() : v.pause() } }} style={btnStyle}>Play / pause preview</button>
          </div>
          <div style={{ fontSize: 11, color: '#8a857c', marginTop: 8, textAlign: 'center', lineHeight: 1.4 }}>
            Live preview. The burned text is rendered server-side and is the source of truth.
          </div>
        </div>

        {/* controls */}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#2a2620', marginBottom: 2 }}>Caption style</div>
          <div style={{ fontSize: 12, color: '#8a857c', marginBottom: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clip.suggested_hook || 'Clip'}</div>

          <label style={labelStyle}>Font</label>
          <select value={font} onChange={e => setFont(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #d9d4c9', fontSize: 13, background: '#fff', color: '#2a2620' }}>
            {FONTS.map(f => <option key={f.value || 'tpl'} value={f.value}>{f.label}</option>)}
          </select>

          <label style={{ ...labelStyle, marginTop: 18 }}>Casing</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['default', 'Default'], ['natural', 'As spoken'], ['caps', 'ALL CAPS']].map(([v, l]) => (
              <button key={v} onClick={() => setCasing(v)} style={{ ...btnStyle, flex: 1, ...(casing === v ? sel : {}) }}>{l}</button>
            ))}
          </div>

          <label style={{ ...labelStyle, marginTop: 18 }}>Vertical position (higher ↑ / lower ↓)</label>
          <input type="range" min="2" max="80" value={position} onChange={e => setPosition(Number(e.target.value))} style={{ width: '100%' }} />
          <div style={{ fontSize: 11, color: '#8a857c', marginTop: 2 }}>{position}% from bottom</div>

          <label style={{ ...labelStyle, marginTop: 18 }}>Outline</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['default', 'none', 'thin', 'thick'].map(o => (
              <button key={o} onClick={() => setOutline(o)} style={{ ...btnStyle, flex: 1, textTransform: 'capitalize', ...(outline === o ? sel : {}) }}>{o}</button>
            ))}
          </div>

          {err && <div style={{ marginTop: 14, fontSize: 12, color: '#b42318', background: '#fdeceb', padding: '8px 10px', borderRadius: 6 }}>{err}</div>}

          <div style={{ flex: 1, minHeight: 16 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button onClick={onClose} disabled={submitting} style={{ ...btnStyle, flex: 1 }}>Cancel</button>
            <button onClick={apply} disabled={submitting} style={{ ...btnStyle, flex: 1.4, ...sel, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Rendering…' : 'Apply & render'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const btnStyle = {
  padding: '8px 12px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
  background: '#fff', color: '#2a2620', border: '1px solid #d9d4c9', borderRadius: 7, fontFamily: 'inherit',
}
const sel = { background: '#2a2620', color: '#fff', borderColor: '#2a2620' }
const labelStyle = { fontSize: 12.5, color: '#5f5a51', marginBottom: 6, display: 'block', fontWeight: 500 }
