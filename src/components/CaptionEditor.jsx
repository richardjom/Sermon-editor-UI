import React, { useState, useRef, useEffect, useMemo } from 'react'

/* ============================================================================
 * Caption editor — live preview of position / outline / font / weight / casing.
 *
 * Single-column, stacked layout (preview on top, controls below) so it can
 * never overflow horizontally. The preview is a live HTML overlay on the
 * source <video>; tweaking is instant (no server render). The ffmpeg burn
 * happens once on "Apply & render". This only changes caption STYLING — never
 * A/V sync or caption timing. Settings persist per-clip in localStorage.
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

// Mirrors backend CAPTION_FONTS. `value` is the exact ASS Fontname; css/weight
// drive the live preview only.
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
  if (typeof document === 'undefined' || document.getElementById('caption-editor-fonts')) return
  const link = document.createElement('link')
  link.id = 'caption-editor-fonts'; link.rel = 'stylesheet'; link.href = GOOGLE_FONTS_URL
  document.head.appendChild(link)
}

function loadSaved(clipId) {
  try { const raw = localStorage.getItem(`captionEdit:${clipId}`); return raw ? JSON.parse(raw) : null }
  catch { return null }
}
function save(clipId, v) { try { localStorage.setItem(`captionEdit:${clipId}`, JSON.stringify(v)) } catch {} }

export function CaptionEditor({ clip, sermon, onRender, onClose, onApplied }) {
  const saved = loadSaved(clip.id)
  const defaultVertical = sermon?.render_options?.vertical !== false // default to 9:16 (the usual export)

  const clipStart = useMemo(() => hmsToSec(clip.start_timestamp), [clip])
  const clipEnd = useMemo(() => hmsToSec(clip.end_timestamp), [clip])

  // A SHORT representative phrase — never the whole hook sentence (which is
  // too long for a real caption line and blew out the old layout).
  const sampleText = useMemo(() => {
    const src = (clip.suggested_hook || clip.transcript || 'Caption preview').trim()
    return src.split(/\s+/).slice(0, 5).join(' ')
  }, [clip])

  const [ratio, setRatio] = useState(saved?.ratio ?? (defaultVertical ? '9:16' : '16:9'))
  const [position, setPosition] = useState(saved?.position ?? 25)
  const [outline, setOutline] = useState(saved?.outline ?? 'default')
  const [font, setFont] = useState(saved?.font ?? '')
  const [weight, setWeight] = useState(saved?.weight ?? 'default') // default | regular | bold
  const [casing, setCasing] = useState(saved?.casing ?? 'default')  // default | natural | caps
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const videoRef = useRef(null)
  const boxRef = useRef(null)
  const [boxH, setBoxH] = useState(360)

  useEffect(() => { ensureFontsLoaded() }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onMeta = () => { try { v.currentTime = clipStart } catch {} }
    const onTime = () => { if (v.currentTime >= clipEnd || v.currentTime < clipStart - 0.5) v.currentTime = clipStart }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('timeupdate', onTime)
    return () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('timeupdate', onTime) }
  }, [clipStart, clipEnd])

  useEffect(() => { if (boxRef.current) setBoxH(boxRef.current.clientHeight || 360) })

  const fontDef = FONTS.find(f => f.value === font) || FONTS[0]
  const previewWeight = weight === 'bold' ? 700 : weight === 'regular' ? 400 : fontDef.weight
  const fontSize = Math.max(13, Math.round(boxH * 0.05))
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
      if (weight === 'bold') payload.captionBold = true
      else if (weight === 'regular') payload.captionBold = false
      if (casing === 'caps') payload.captionUppercase = true
      else if (casing === 'natural') payload.captionUppercase = false
      save(clip.id, { ratio, position, outline, font, weight, casing })
      await onRender?.(clip.id, payload)
      onApplied?.(); onClose?.()
    } catch (e) {
      setErr('Could not start render. Check the API is reachable.')
      setSubmitting(false)
    }
  }

  const Seg = ({ options, value, onChange }) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          style={{ ...btn, flex: '1 1 0', minWidth: 64, ...(value === v ? sel : {}) }}>{l}</button>
      ))}
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(20,18,15,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, width: 'min(440px, 96vw)',
        maxHeight: '94vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
        padding: 18, boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#2a2620' }}>Caption style</div>
        <div style={{ fontSize: 12, color: '#8a857c', margin: '2px 0 14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {clip.suggested_hook || 'Clip'}
        </div>

        {/* preview */}
        <div ref={boxRef} style={{
          position: 'relative', aspectRatio: ratio === '9:16' ? '9 / 16' : '16 / 9',
          background: '#000', borderRadius: 10, overflow: 'hidden',
          margin: '0 auto', maxHeight: '46vh',
        }}>
          {sermon?.source_video_url ? (
            <video ref={videoRef} src={sermon.source_video_url} muted playsInline preload="metadata"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 12 }}>No source preview</div>
          )}
          <div style={{ position: 'absolute', left: '6%', right: '6%', bottom: `${position}%`, textAlign: 'center', pointerEvents: 'none' }}>
            <span style={{
              fontFamily: fontDef.css, fontWeight: previewWeight, fontSize, lineHeight: 1.15,
              color: '#fff', textShadow, textTransform,
              WebkitTextStroke: (outlinePx && outlinePx > 0) ? `${Math.max(1, Math.round(outlinePx * 0.6))}px #000` : undefined,
            }}>{sampleText}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <button onClick={() => { const v = videoRef.current; if (v) { v.paused ? v.play() : v.pause() } }} style={{ ...btn, flex: 1 }}>Play / pause</button>
          <div style={{ display: 'flex', gap: 4 }}>
            {['9:16', '16:9'].map(r => (
              <button key={r} onClick={() => setRatio(r)} style={{ ...btn, padding: '8px 10px', ...(ratio === r ? sel : {}) }}>{r}</button>
            ))}
          </div>
        </div>

        {/* controls */}
        <div style={{ marginTop: 16 }}>
          <label style={lbl}>Font</label>
          <select value={font} onChange={e => setFont(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 7, border: '1px solid #d9d4c9', fontSize: 13, background: '#fff', color: '#2a2620' }}>
            {FONTS.map(f => <option key={f.value || 'tpl'} value={f.value}>{f.label}</option>)}
          </select>

          <label style={{ ...lbl, marginTop: 14 }}>Weight</label>
          <Seg options={[['default', 'Default'], ['regular', 'Regular'], ['bold', 'Bold']]} value={weight} onChange={setWeight} />

          <label style={{ ...lbl, marginTop: 14 }}>Casing</label>
          <Seg options={[['default', 'Default'], ['natural', 'As spoken'], ['caps', 'ALL CAPS']]} value={casing} onChange={setCasing} />

          <label style={{ ...lbl, marginTop: 14 }}>Vertical position (higher ↑ / lower ↓)</label>
          <input type="range" min="2" max="80" value={position} onChange={e => setPosition(Number(e.target.value))} style={{ width: '100%' }} />
          <div style={{ fontSize: 11, color: '#8a857c', marginTop: 2 }}>{position}% from bottom</div>

          <label style={{ ...lbl, marginTop: 14 }}>Outline</label>
          <Seg options={[['default', 'Default'], ['none', 'None'], ['thin', 'Thin'], ['thick', 'Thick']]} value={outline} onChange={setOutline} />
        </div>

        {err && <div style={{ marginTop: 12, fontSize: 12, color: '#b42318', background: '#fdeceb', padding: '8px 10px', borderRadius: 6 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} disabled={submitting} style={{ ...btn, flex: 1 }}>Cancel</button>
          <button onClick={apply} disabled={submitting} style={{ ...btn, flex: 1.5, ...sel, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Rendering…' : 'Apply & render'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#8a857c', marginTop: 8, lineHeight: 1.4 }}>
          Live preview is an approximation; the server-burned text is the source of truth. Preview shows a sample phrase — real captions still play word-by-word.
        </div>
      </div>
    </div>
  )
}

const btn = {
  padding: '8px 12px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
  background: '#fff', color: '#2a2620', border: '1px solid #d9d4c9', borderRadius: 7, fontFamily: 'inherit',
}
const sel = { background: '#2a2620', color: '#fff', borderColor: '#2a2620' }
const lbl = { fontSize: 12.5, color: '#5f5a51', marginBottom: 6, display: 'block', fontWeight: 500 }
