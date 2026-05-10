import React, { useState, useEffect, useRef } from 'react'
import { Badge, Btn, Spinner, EmptyState } from '../components/ui.jsx'
import { getSermon, reprocessSermon } from '../api.js'

/* ============================================================================
 * Sermon detail page
 *
 * Layout: split view with the sermon's source content on the left and the
 * generated clips on the right.
 *
 *   ┌─────────────────────────────────────┬─────────────────────────────┐
 *   │ Header (back, title, status)                                      │
 *   ├─────────────────────────────────────┼─────────────────────────────┤
 *   │ Source video player                 │ Bulk action bar             │
 *   │                                     │                             │
 *   │ Tabs: Overview | Transcript         │ Clip cards (vertical list)  │
 *   │ Tab content                         │                             │
 *   └─────────────────────────────────────┴─────────────────────────────┘
 *
 * The right sidebar is meant to grow over time as we add new output types
 * (social posts, discussion guides, etc.). Today it's just clips. The left
 * panel rarely changes — it's a context viewer for "what is this sermon".
 * ========================================================================== */

export function SermonDetailPage({ sermonId, clientId, clients, onBack }) {
  const [sermon, setSermon] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(30)
  const pollingRef = useRef(null)

  async function load() {
    try {
      const s = await getSermon(sermonId)
      const client = clients.find(c => c.id === (clientId || s.client_id))
      setSermon({ ...s, _clientName: client?.name })
      setLoading(false)
      if (s.status === 'processing') startPolling()
      else stopPolling()
    } catch (e) {
      setLoading(false)
    }
  }

  function startPolling() {
    if (pollingRef.current) return
    pollingRef.current = setInterval(async () => {
      setProgress(p => Math.min(p + 4, 90))
      try {
        const s = await getSermon(sermonId)
        if (s.status !== 'processing') {
          stopPolling()
          const client = clients.find(c => c.id === (clientId || s.client_id))
          setSermon({ ...s, _clientName: client?.name })
        }
      } catch (e) {}
    }, 5000)
  }

  function stopPolling() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
  }

  useEffect(() => {
    setLoading(true)
    setProgress(30)
    load()
    return () => stopPolling()
  }, [sermonId])

  async function handleReprocess() {
    await reprocessSermon(sermonId)
    setLoading(true)
    setProgress(30)
    setSermon(null)
    load()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <DetailHeader sermon={sermon} sermonId={sermonId} onBack={onBack} onReprocess={handleReprocess} />

      {loading && (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '3rem' }}>
          <Spinner size={24} />
        </div>
      )}

      {!loading && sermon?.status === 'processing' && (
        <ProcessingState progress={progress} />
      )}

      {!loading && sermon?.status === 'failed' && (
        <FailedState sermon={sermon} onReprocess={handleReprocess} />
      )}

      {!loading && sermon?.status === 'completed' && (
        <SplitView sermon={sermon} onReprocess={handleReprocess} />
      )}
    </div>
  )
}

/* ---------- Header ---------- */

function DetailHeader({ sermon, sermonId, onBack, onReprocess }) {
  const date = sermon?.sermon_date
    ? new Date(sermon.sermon_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  const duration = sermon?.duration_seconds ? formatDuration(sermon.duration_seconds) : ''
  const meta = [sermon?._clientName, date, duration].filter(Boolean).join(' · ')

  return (
    <div style={{
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      padding: '0.85rem 1.5rem',
      display: 'flex', alignItems: 'center', gap: 12,
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-2)', fontSize: 13, padding: '4px 8px',
          borderRadius: 6,
        }}
      >
        ← back
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sermon?.title || sermonId}
        </div>
        {meta && (
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>{meta}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {sermon && <Badge status={sermon.status} />}
        {sermon?.status === 'completed' && <Btn small onClick={onReprocess}>Reprocess</Btn>}
      </div>
    </div>
  )
}

/* ---------- Loading / failure states ---------- */

function ProcessingState({ progress }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '3rem' }}>
      <div style={{ textAlign: 'center' }}>
        <Spinner size={24} />
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: '1rem' }}>
          Processing sermon… checking back automatically
        </p>
        <div style={{ width: 300, margin: '1rem auto 0', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--text)', borderRadius: 2, width: `${progress}%`, transition: 'width 1s ease' }} />
        </div>
      </div>
    </div>
  )
}

function FailedState({ sermon, onReprocess }) {
  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{
        border: '1px solid var(--red-bg)', borderRadius: 10,
        background: 'var(--red-bg)', padding: '1rem',
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--red-text)', marginBottom: 6 }}>
          Processing failed
        </div>
        {sermon?.error_message && (
          <div style={{ fontSize: 12, color: 'var(--red-text)', fontFamily: 'DM Mono, monospace' }}>
            {sermon.error_message}
          </div>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <Btn onClick={onReprocess}>Reprocess</Btn>
      </div>
    </div>
  )
}

/* ---------- Split view: source on the left, clips sidebar on the right ---------- */

function SplitView({ sermon, onReprocess }) {
  return (
    <div style={{
      flex: 1,
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
      gap: 24,
      padding: '1.5rem',
      alignItems: 'start',
    }}>
      <SourcePanel sermon={sermon} />
      <ClipsSidebar sermon={sermon} onReprocess={onReprocess} />
    </div>
  )
}

/* ---------- Left: source video + tabs ---------- */

function SourcePanel({ sermon }) {
  const [tab, setTab] = useState('overview')

  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      {sermon.source_video_url ? (
        <div style={{
          background: '#000', borderRadius: 12, overflow: 'hidden',
          border: '1px solid var(--border)',
        }}>
          <video
            src={sermon.source_video_url}
            controls
            preload="metadata"
            style={{ width: '100%', maxHeight: 480, display: 'block' }}
          />
        </div>
      ) : (
        <div style={{
          background: 'var(--surface-2)', border: '1px dashed var(--border-mid)',
          borderRadius: 12, padding: '3rem', textAlign: 'center',
          color: 'var(--text-3)', fontSize: 13,
        }}>
          No source video available (audio-only pipeline or older sermon)
        </div>
      )}

      <div style={{
        border: '1px solid var(--border)', borderRadius: 12,
        background: 'var(--surface)', overflow: 'hidden',
      }}>
        <Tabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'transcript', label: 'Transcript' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div style={{ padding: '1rem 1.25rem' }}>
          {tab === 'overview' && <OverviewTab sermon={sermon} />}
          {tab === 'transcript' && <TranscriptTab sermon={sermon} />}
        </div>
      </div>
    </div>
  )
}

function OverviewTab({ sermon }) {
  const opts = sermon.render_options || {}
  const optsList = []
  if (opts.vertical) optsList.push('Vertical (9:16)')
  if (opts.vertical && opts.face_tracking !== false) optsList.push('AI face tracking')
  if (opts.crop_lower_third === true) optsList.push('Crop lower third (forced)')
  else if (opts.crop_lower_third === false) optsList.push('Crop lower third (off)')
  else if (opts.vertical) optsList.push('Crop lower third (auto-detect)')
  if (!optsList.length) optsList.push('Default (horizontal, no reframing)')

  const processedAt = sermon.processed_at
    ? new Date(sermon.processed_at).toLocaleString()
    : null

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Field label="Sermon" value={sermon.title} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Date" value={sermon.sermon_date
          ? new Date(sermon.sermon_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : '—'} />
        <Field label="Duration" value={sermon.duration_seconds ? formatDuration(sermon.duration_seconds) : '—'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Client" value={sermon._clientName || sermon.client_id || '—'} />
        <Field label="Clips found" value={String(sermon.clips_found || 0)} />
      </div>
      <Field label="Render options" value={optsList.join(' · ')} />
      {processedAt && <Field label="Processed at" value={processedAt} />}
    </div>
  )
}

function TranscriptTab({ sermon }) {
  if (!sermon.transcript) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '2rem' }}>
        No transcript available yet
      </div>
    )
  }
  const wordCount = sermon.transcript.split(/\s+/).length
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
        {wordCount.toLocaleString()} words
      </div>
      <div style={{
        fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7,
        maxHeight: 480, overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        background: 'var(--surface-2)', borderRadius: 8,
        padding: '1rem',
      }}>
        {sermon.transcript}
      </div>
    </div>
  )
}

function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface-2)',
    }}>
      {tabs.map(t => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: '12px 18px',
              fontSize: 13, fontWeight: 500,
              border: 'none', background: 'transparent',
              color: active ? 'var(--text)' : 'var(--text-2)',
              borderBottom: `2px solid ${active ? 'var(--text)' : 'transparent'}`,
              cursor: 'pointer',
              transition: 'color 0.12s',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Right: clips sidebar ---------- */

function ClipsSidebar({ sermon, onReprocess }) {
  const clips = sermon.clips || []

  async function handleDownloadAll() {
    for (const clip of clips) {
      if (!clip.rendered_video_url) continue
      const a = document.createElement('a')
      a.href = clip.rendered_video_url
      a.download = `${slug(sermon.title || 'sermon')}-${clip.clip_id.slice(0, 8)}.mp4`
      a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      await new Promise(r => setTimeout(r, 350))
    }
  }

  const hasAnyRendered = clips.some(c => c.rendered_video_url)

  return (
    <div style={{ display: 'grid', gap: 12, position: 'sticky', top: 84, alignSelf: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>
          Clips <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· {clips.length}</span>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 8,
        padding: 8,
        background: 'var(--surface-2)', borderRadius: 10,
        border: '1px solid var(--border)',
      }}>
        <Btn small onClick={onReprocess} style={{ flex: 1 }}>
          Find more
        </Btn>
        <Btn small onClick={handleDownloadAll} disabled={!hasAnyRendered} style={{ flex: 1 }}>
          Download all
        </Btn>
      </div>

      {clips.length === 0 ? (
        <EmptyState message="No clips were identified for this sermon." />
      ) : (
        <div style={{
          display: 'grid', gap: 12,
          maxHeight: 'calc(100vh - 180px)',
          overflowY: 'auto', paddingRight: 4,
        }}>
          {clips.map((clip, i) => (
            <ClipCard key={clip.clip_id || i} clip={clip} sermonTitle={sermon.title} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Clip card ---------- */

function ClipCard({ clip, sermonTitle }) {
  const [expanded, setExpanded] = useState(false)
  const hasVideo = !!clip.rendered_video_url
  const duration = clipDurationSec(clip)

  function handleDownload() {
    if (!clip.rendered_video_url) return
    const a = document.createElement('a')
    a.href = clip.rendered_video_url
    a.download = `${slug(sermonTitle || 'sermon')}-${clip.clip_id.slice(0, 8)}.mp4`
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      background: 'var(--surface)', overflow: 'hidden',
    }}>
      {/* Header strip — duration + strength + (future) tags */}
      <div style={{
        padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
      }}>
        {duration && (
          <span style={{
            fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500,
            color: 'var(--text)',
            background: 'var(--surface)',
            padding: '2px 8px', borderRadius: 6,
            border: '1px solid var(--border)',
          }}>
            {Math.round(duration)}s
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Badge status={clip.strength?.toLowerCase()} />
      </div>

      {/* Video / error */}
      {hasVideo && (
        <div style={{ background: '#000', display: 'flex', justifyContent: 'center' }}>
          <video
            src={clip.rendered_video_url}
            controls
            preload="metadata"
            style={{ maxHeight: 380, maxWidth: '100%', display: 'block' }}
          />
        </div>
      )}
      {!hasVideo && clip.render_error && (
        <div style={{
          padding: '10px 12px', fontSize: 12,
          color: 'var(--red-text)', background: 'var(--red-bg)',
        }}>
          <strong>Render failed:</strong> {clip.render_error}
        </div>
      )}

      {/* Body */}
      <div style={{ padding: '12px' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
          {clip.start_timestamp} → {clip.end_timestamp}
        </div>
        {clip.suggested_hook && (
          <div style={{
            fontSize: 14, fontWeight: 500, color: 'var(--text)',
            marginBottom: 8, lineHeight: 1.4,
          }}>
            {clip.suggested_hook}
          </div>
        )}
        {clip.transcript && (
          <p style={{
            fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6,
            fontStyle: 'italic',
            paddingLeft: 10, borderLeft: '3px solid var(--border-mid)',
            margin: '0 0 8px',
            display: '-webkit-box',
            WebkitLineClamp: expanded ? 'unset' : 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            "{clip.transcript}"
          </p>
        )}

        {expanded && (
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <Field label="Why it works" value={clip.why_it_works} small />
            <Field label="Caption" value={clip.suggested_caption} small />
          </div>
        )}

        {/* Footer actions */}
        <div style={{
          display: 'flex', gap: 6, marginTop: 12, alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <Btn small onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Less' : 'More'}
          </Btn>
          {clip.suggested_hook && (
            <CopyButton text={clip.suggested_hook} label="Copy hook" />
          )}
          {clip.suggested_caption && (
            <CopyButton text={clip.suggested_caption} label="Copy caption" />
          )}
          {hasVideo && (
            <Btn small primary onClick={handleDownload}>Download</Btn>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- Small helpers ---------- */

function Field({ label, value, small }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: small ? 12 : 13, color: 'var(--text)', lineHeight: 1.55 }}>
        {value || '—'}
      </div>
    </div>
  )
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false)
  function handle() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <Btn small onClick={handle}>
      {copied ? 'Copied' : label}
    </Btn>
  )
}

function clipDurationSec(clip) {
  try {
    const s = parseHMS(clip.start_timestamp)
    const e = parseHMS(clip.end_timestamp)
    if (e > s) return e - s
  } catch (e) {}
  return null
}

function parseHMS(ts) {
  if (!ts) return NaN
  const parts = ts.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return NaN
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

function slug(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'clip'
}
