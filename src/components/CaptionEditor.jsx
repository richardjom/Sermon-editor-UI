import React, { useState, useRef, useEffect, useMemo } from 'react'

/* ============================================================================
 * Caption editor — Phase 1 (position + outline, live preview)
 *
 * Goal: let the user nudge a clip's caption position and outline and SEE it
 * over the actual video before committing to a render. The preview is a live
 * HTML overlay on top of the source <video> — it never triggers a server
 * render, so tweaking is instant. The expensive ffmpeg burn happens once,
 * on "Apply & render".
 *
 * IMPORTANT — this only changes caption STYLING. It does not touch A/V sync
 * or caption timing: the render still uses the same normalize / cut / word
 * timings. We only pass two extra optional params (caption_position,
 * caption_outline) to the existing render endpoint. If the user never opens
 * this editor, nothing about the pipeline changes.
 *
 * Persistence: settings are saved per-clip in localStorage (Phase 1). A
 * future phase can promote them to a DB column for cross-device sync.
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

  // Sample text to position — the editorial hook, falling back to the first
  // words of the transcript. (Phase 1 previews a representative phrase; live
  // word-by-word sync is a later phase.)
  const sampleText = useMemo(() => {
    const hook = (clip.suggested_hook || '').trim()
    if (hook) return hook
    const t = (clip.transcript || '').trim().split(/\s+/).slice(0, 7).join(' ')
    return t || 'Caption preview'
  }, [clip])

  const saved = loadSaved(clip.id)
  const [position, setPosition] = useState(saved?.position ?? (vertical ? 25 : 11))
  const [outline, setOutline] = useState(saved?.outline ?? 'default')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const videoRef = useRef(null)
  const boxRef = useRef(null)
  const [boxH, setBoxH] = useState(420)

  // Seek the source video to the clip start once it can play, and keep
  // playback clamped to the clip window so the preview only shows this clip.
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

  // Preview caption style mirroring the burn as closely as HTML allows.
  const fontSize = Math.max(12, Math.round(boxH * 0.035))
  const outlinePx = OUTLINE_PX[outline]
  const textShadow = (outlinePx === null || outlinePx > 0)
    // template default (null) keeps a black outline-ish look; explicit
    // thin/thick scale the stroke. "none" → soft shadow only.
    ? `0 0 ${(outlinePx ?? 3) + 1}px #000, 0 0 ${(outlinePx ?? 3) + 1}px #000, 0 1px 2px rgba(0,0,0,.6)`
    : '0 1px 3px rgba(0,0,0,.55)'

  async function apply() {
    setSubmitting(true); setErr('')
    try {
      const payload = { captionPosition: Number(position) }
      if (OUTLINE_PX[outline] !== null) payload.captionOutline = OUTLINE_PX[outline]
      save(clip.id, { position, outline })
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
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 20,
    }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: 'min(880px, 96vw)',
          maxHeight: '92vh', overflow: 'auto', display: 'grid',
          gridTemplateColumns: '1.2fr 1fr', gap: 0,
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
        }}
      >
        {/* preview */}
        <div style={{ padding: 18, borderRight: '1px solid #ece8e0' }}>
          <div
            ref={boxRef}
            style={{
              position: 'relative', aspectRatio: aspect, background: '#000',
              borderRadius: 10, overflow: 'hidden', margin: '0 auto',
              maxHeight: '64vh',
            }}
          >
            {sermon?.source_video_url ? (
              <video
                ref={videoRef}
                src={sermon.source_video_url}
                muted
                playsInline
                preload="metadata"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13 }}>
                No source preview available
              </div>
            )}
            {/* live caption overlay */}
            <div style={{
              position: 'absolute', left: '6%', right: '6%',
              bottom: `${position}%`, textAlign: 'center', pointerEvents: 'none',
            }}>
              <span style={{
                fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 700,
                fontSize, lineHeight: 1.15, color: '#fff', textShadow,
                WebkitTextStroke: (outlinePx && outlinePx > 0) ? `${Math.max(1, Math.round(outlinePx * 0.6))}px #000` : undefined,
              }}>
                {sampleText}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
            <button onClick={() => { const v = videoRef.current; if (v) { v.paused ? v.play() : v.pause() } }}
              style={btnStyle}>Play / pause preview</button>
          </div>
          <div style={{ fontSize: 11, color: '#8a857c', marginTop: 8, textAlign: 'center', lineHeight: 1.4 }}>
            Live preview. The final burned text is rendered server-side and is the source of truth.
          </div>
        </div>

        {/* controls */}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#2a2620', marginBottom: 2 }}>Caption position & outline</div>
          <div style={{ fontSize: 12, color: '#8a857c', marginBottom: 16 }}>{clip.suggested_hook || 'Clip'}</div>

          <label style={labelStyle}>Vertical position (higher ↑ / lower ↓)</label>
          <input type="range" min="2" max="80" value={position}
            onChange={e => setPosition(Number(e.target.value))}
            style={{ width: '100%' }} />
          <div style={{ fontSize: 11, color: '#8a857c', marginTop: 2 }}>{position}% from bottom</div>

          <label style={{ ...labelStyle, marginTop: 20 }}>Outline</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['default', 'none', 'thin', 'thick'].map(o => (
              <button key={o} onClick={() => setOutline(o)}
                style={{
                  ...btnStyle, flex: 1, textTransform: 'capitalize',
                  ...(outline === o ? { background: '#2a2620', color: '#fff', borderColor: '#2a2620' } : {}),
                }}>{o}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#8a857c', marginTop: 6, lineHeight: 1.4 }}>
            “Default” keeps the template’s outline. “None” removes it (soft shadow only).
          </div>

          {err && <div style={{ marginTop: 14, fontSize: 12, color: '#b42318', background: '#fdeceb', padding: '8px 10px', borderRadius: 6 }}>{err}</div>}

          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={onClose} disabled={submitting} style={{ ...btnStyle, flex: 1 }}>Cancel</button>
            <button onClick={apply} disabled={submitting}
              style={{ ...btnStyle, flex: 1.4, background: '#2a2620', color: '#fff', borderColor: '#2a2620', opacity: submitting ? 0.6 : 1 }}>
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
  background: '#fff', color: '#2a2620', border: '1px solid #d9d4c9',
  borderRadius: 7, fontFamily: 'inherit',
}
const labelStyle = { fontSize: 12.5, color: '#5f5a51', marginBottom: 6, display: 'block', fontWeight: 500 }
