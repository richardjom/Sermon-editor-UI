import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Icon } from '../components/Icon.jsx'
import { Spinner, EmptyState } from '../components/ui.jsx'
import { getSermon, reprocessSermon } from '../api.js'

/* ============================================================================
 * Sermon detail page — "Brief" design.
 *
 * Two-column layout. Top bar across both. Left column owns the source viewing
 * experience (custom video player + clip-map strip + Overview/Transcript/
 * Render-settings tabs). Right column owns clip management (search, filters,
 * sort, accordion). The right rail is where features grow; the left rarely
 * changes.
 *
 * The visual treatment uses a warm editorial palette + Fraunces serif for
 * headlines + Geist Mono for timecodes + Inter for chrome. The rest of the
 * app keeps its existing palette for now — this page is intentionally
 * scoped.
 *
 * Mapping our API to the prototype shape:
 *   sermon.title             → title in top bar
 *   sermon.sermon_date       → meta line
 *   sermon.duration_seconds  → meta line "41m 8s"
 *   sermon.source_video_url  → <video src=...>
 *   sermon.transcript        → Transcript tab
 *   sermon.render_options    → Render settings tab
 *   clip.suggested_hook      → clip title (the editorial headline)
 *   clip.transcript          → expanded clip blockquote
 *   clip.start_timestamp     → parsed → inSec
 *   clip.end_timestamp       → parsed → outSec
 *   clip.strength            → "High" / "Medium"
 *   clip.rendered_video_url  → Download button + auto-play in main player
 *
 * Deferred to v2 (UI present but disabled / shows TODO):
 *   - Trim (needs render-on-demand endpoint)
 *   - Share (no spec yet)
 *   - Manual clip creation from transcript or timeline
 *   - Multi-format chips (we currently render one format per clip)
 * ========================================================================== */

const colors = {
  bg: '#f6f3ec',
  card: '#fbf9f3',
  ink: '#1f1a14',
  body: '#3a322a',
  dim: '#867a6b',
  muted: '#a89d8c',
  line: 'rgba(40,30,20,.08)',
  line2: 'rgba(40,30,20,.14)',
  high: '#3e8c5a',
  med: '#b08442',
  fav: '#c97a4a',
  surface: '#efeadf',
  paper: '#f6f3ec',
}

const FONTS = {
  sans: '"Inter", system-ui, -apple-system, sans-serif',
  serif: '"Fraunces", Georgia, serif',
  mono: '"Geist Mono", "DM Mono", "JetBrains Mono", monospace',
}

/* ============================================================================
 * Storage helpers — star/archive live in localStorage until the backend has
 * columns for them.
 * ========================================================================== */

function loadClipFlags(sermonId) {
  try {
    const raw = localStorage.getItem(`clipFlags:${sermonId}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveClipFlags(sermonId, flags) {
  try {
    localStorage.setItem(`clipFlags:${sermonId}`, JSON.stringify(flags))
  } catch {}
}

/* ============================================================================
 * Page
 * ========================================================================== */

export function SermonDetailPage({ sermonId, clientId, clients, onBack }) {
  const [sermon, setSermon] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(30)
  const [clipFlags, setClipFlags] = useState(() => loadClipFlags(sermonId))
  const pollingRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const s = await getSermon(sermonId)
      const client = clients.find(c => c.id === (clientId || s.client_id))
      setSermon({ ...s, _clientName: client?.name })
      setLoading(false)
      if (s.status === 'processing') startPolling()
      else stopPolling()
    } catch {
      setLoading(false)
    }
  }, [sermonId, clientId, clients])

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
      } catch {}
    }, 5000)
  }

  function stopPolling() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
  }

  useEffect(() => {
    setLoading(true)
    setProgress(30)
    setClipFlags(loadClipFlags(sermonId))
    load()
    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sermonId])

  async function handleReprocess() {
    await reprocessSermon(sermonId)
    setLoading(true)
    setProgress(30)
    setSermon(null)
    load()
  }

  function toggleFav(clipId) {
    setClipFlags(prev => {
      const next = { ...prev, [clipId]: { ...prev[clipId], fav: !prev[clipId]?.fav } }
      saveClipFlags(sermonId, next)
      return next
    })
  }
  function toggleArchived(clipId) {
    setClipFlags(prev => {
      const next = { ...prev, [clipId]: { ...prev[clipId], archived: !prev[clipId]?.archived } }
      saveClipFlags(sermonId, next)
      return next
    })
  }

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      background: colors.bg, color: colors.body,
      fontFamily: FONTS.sans, fontSize: 13,
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <TopBar sermon={sermon} sermonId={sermonId} onBack={onBack} onReprocess={handleReprocess} />

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
        <Body
          sermon={sermon}
          clipFlags={clipFlags}
          onToggleFav={toggleFav}
          onToggleArchived={toggleArchived}
          onReprocess={handleReprocess}
        />
      )}
    </div>
  )
}

/* ============================================================================
 * Top bar
 * ========================================================================== */

function TopBar({ sermon, sermonId, onBack, onReprocess }) {
  const meta = sermon
    ? [sermon._clientName || sermon.client_id, formatDate(sermon.sermon_date), formatDuration(sermon.duration_seconds)]
        .filter(Boolean).join(' · ')
    : ''
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '20px 28px', gap: 18,
      borderBottom: `1px solid ${colors.line}`,
      position: 'sticky', top: 0, zIndex: 10,
      background: colors.bg,
    }}>
      <button onClick={onBack} style={{
        background: 'transparent', border: 'none', color: colors.dim,
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        fontSize: 12.5, fontFamily: FONTS.sans,
      }}>
        <Icon name="back" size={14} /> Back
      </button>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: FONTS.serif, fontSize: 22, fontWeight: 500,
          color: colors.ink, letterSpacing: -0.2, lineHeight: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '40vw',
        }}>
          {sermon?.title || sermonId}
        </div>
        {meta && (
          <div style={{ fontSize: 11.5, color: colors.dim, marginTop: 4, fontFamily: FONTS.mono }}>
            {meta}
          </div>
        )}
      </div>
      <div style={{ flex: 1 }} />
      {sermon && <StatusPill status={sermon.status} />}
      {sermon?.status === 'completed' && (
        <button onClick={onReprocess} style={{
          background: 'transparent', border: `1px solid ${colors.line2}`,
          color: colors.body, padding: '8px 14px', borderRadius: 8,
          fontSize: 12.5, cursor: 'pointer', fontFamily: FONTS.sans,
        }}>
          Reprocess
        </button>
      )}
    </div>
  )
}

function StatusPill({ status }) {
  const map = {
    completed: { c: colors.high, label: 'Completed' },
    processing: { c: '#a07a26', label: 'Processing' },
    failed: { c: '#a23b3b', label: 'Failed' },
    pending: { c: colors.dim, label: 'Pending' },
    analyzing: { c: '#a07a26', label: 'Analyzing' },
    transcribing: { c: '#a07a26', label: 'Transcribing' },
  }
  const s = map[status] || { c: colors.dim, label: status || '—' }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px',
      background: `${s.c}1a`, color: s.c, borderRadius: 999,
      fontSize: 11.5, fontWeight: 500, fontFamily: FONTS.sans,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: 999, background: s.c }} />
      {s.label}
    </div>
  )
}

/* ============================================================================
 * Loading + failure states
 * ========================================================================== */

function ProcessingState({ progress }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '3rem' }}>
      <div style={{ textAlign: 'center' }}>
        <Spinner size={24} />
        <p style={{ fontSize: 13, color: colors.body, marginTop: '1rem', fontFamily: FONTS.sans }}>
          Processing sermon… checking back automatically
        </p>
        <div style={{ width: 300, margin: '1rem auto 0', height: 4, background: colors.line2, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: colors.ink, borderRadius: 2, width: `${progress}%`, transition: 'width 1s ease' }} />
        </div>
      </div>
    </div>
  )
}

function FailedState({ sermon, onReprocess }) {
  return (
    <div style={{ padding: '1.5rem 28px' }}>
      <div style={{
        border: `1px solid #d8b6b6`, borderRadius: 10,
        background: '#fbecec', padding: '1rem',
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#8b2929', marginBottom: 6, fontFamily: FONTS.sans }}>
          Processing failed
        </div>
        {sermon?.error_message && (
          <div style={{ fontSize: 12, color: '#8b2929', fontFamily: FONTS.mono }}>
            {sermon.error_message}
          </div>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={onReprocess} style={{
          background: colors.ink, color: colors.paper, border: 'none',
          padding: '8px 14px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer',
          fontFamily: FONTS.sans,
        }}>
          Reprocess
        </button>
      </div>
    </div>
  )
}

/* ============================================================================
 * Body — split layout with the source on the left, clip rail on the right
 * ========================================================================== */

function Body({ sermon, clipFlags, onToggleFav, onToggleArchived, onReprocess }) {
  // Decorate clips with derived fields the UI wants
  const allClips = useMemo(
    () => (sermon.clips || []).map(c => decorateClip(c, clipFlags, sermon.render_options)),
    [sermon.clips, clipFlags, sermon.render_options],
  )

  // First HIGH-score clip selected by default (matches prototype)
  const firstHigh = allClips.find(c => c.score === 'High') || allClips[0]
  const [selectedId, setSelectedId] = useState(firstHigh?.id)
  const [expandedId, setExpandedId] = useState(firstHigh?.id)
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('score')
  const [query, setQuery] = useState('')
  const [leftTab, setLeftTab] = useState('overview')

  // Reset selection when the sermon's clip set changes (e.g. after reanalyze)
  useEffect(() => {
    if (!allClips.length) return
    if (!allClips.find(c => c.id === selectedId)) {
      const fh = allClips.find(c => c.score === 'High') || allClips[0]
      setSelectedId(fh.id)
      setExpandedId(fh.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allClips.length])

  const visibleClips = useMemo(() => {
    let r = allClips.filter(c => !c.archived)
    if (filter === 'high') r = r.filter(c => c.score === 'High')
    if (filter === 'starred') r = r.filter(c => c.fav)
    if (query) {
      const q = query.toLowerCase()
      r = r.filter(c =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.transcript || '').toLowerCase().includes(q),
      )
    }
    if (sort === 'score') r = [...r].sort((a, b) => b.scoreNum - a.scoreNum)
    else if (sort === 'length') r = [...r].sort((a, b) => b.durSec - a.durSec)
    else r = [...r].sort((a, b) => a.inSec - b.inSec)
    return r
  }, [allClips, filter, query, sort])

  const selectedClip = allClips.find(c => c.id === selectedId) || allClips[0]

  // Keyboard shortcuts: ↑/↓ navigate, Space play, / search, S star, E archive
  const playerRef = useRef(null)
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key === 'Escape') e.target.blur()
        return
      }
      if (e.key === '/') { e.preventDefault(); document.getElementById('clip-search')?.focus(); return }
      if (e.key === ' ' && playerRef.current) {
        e.preventDefault()
        const v = playerRef.current
        if (v.paused) v.play(); else v.pause()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!visibleClips.length) return
        const idx = visibleClips.findIndex(c => c.id === expandedId)
        const next = e.key === 'ArrowDown'
          ? Math.min(idx + 1, visibleClips.length - 1)
          : Math.max(idx - 1, 0)
        const nc = visibleClips[next]
        if (nc) { setExpandedId(nc.id); setSelectedId(nc.id) }
        e.preventDefault()
        return
      }
      if (e.key.toLowerCase() === 's' && selectedClip) {
        e.preventDefault()
        onToggleFav(selectedClip.id)
      }
      if (e.key.toLowerCase() === 'e' && selectedClip) {
        e.preventDefault()
        onToggleArchived(selectedClip.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visibleClips, expandedId, selectedClip, onToggleFav, onToggleArchived])

  return (
    <div style={{
      flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)',
      minHeight: 0,
    }}>
      <LeftColumn
        sermon={sermon}
        clips={allClips}
        selectedClip={selectedClip}
        selectedId={selectedId}
        setSelectedId={(id) => { setSelectedId(id); setExpandedId(id) }}
        leftTab={leftTab}
        setLeftTab={setLeftTab}
        playerRef={playerRef}
      />
      <RightColumn
        allClips={allClips}
        visibleClips={visibleClips}
        sermon={sermon}
        filter={filter} setFilter={setFilter}
        sort={sort} setSort={setSort}
        query={query} setQuery={setQuery}
        expandedId={expandedId}
        onToggle={(id) => {
          setExpandedId(prev => (prev === id ? null : id))
          setSelectedId(id)
        }}
        onSelect={(id) => setSelectedId(id)}
        onFav={onToggleFav}
        onArchive={onToggleArchived}
        onReprocess={onReprocess}
      />
    </div>
  )
}

/* ============================================================================
 * Left column — video, clip-map strip, tabs
 * ========================================================================== */

function LeftColumn({ sermon, clips, selectedClip, selectedId, setSelectedId, leftTab, setLeftTab, playerRef }) {
  return (
    <div style={{
      padding: '20px 24px 20px 28px',
      display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
    }}>
      <VideoPlayer
        sermon={sermon}
        clips={clips}
        selectedClip={selectedClip}
        selectedId={selectedId}
        playerRef={playerRef}
      />
      <ClipMapStrip
        sermon={sermon}
        clips={clips}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        playerRef={playerRef}
      />
      <LeftTabs leftTab={leftTab} setLeftTab={setLeftTab} />
      <div style={{ padding: '4px 2px 24px' }}>
        {leftTab === 'overview' && <OverviewTab sermon={sermon} clips={clips} />}
        {leftTab === 'transcript' && <TranscriptTab sermon={sermon} />}
        {leftTab === 'details' && <DetailsTab sermon={sermon} />}
      </div>
    </div>
  )
}

/* ---------- Video player with custom controls ---------- */

function VideoPlayer({ sermon, clips, selectedClip, selectedId, playerRef }) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(sermon.duration_seconds || 0)
  const scrubberRef = useRef(null)

  // When the user clicks a different clip, seek the video to that clip's
  // start. We keep one <video> element across selection changes — no
  // unmount/remount — and just adjust currentTime.
  useEffect(() => {
    if (selectedClip && playerRef.current) {
      const v = playerRef.current
      // Seek slightly into the clip so the speaker is already mid-sentence
      v.currentTime = Math.max(0, selectedClip.inSec + 0.05)
    }
  }, [selectedId])  // eslint-disable-line react-hooks/exhaustive-deps

  function handleTimeUpdate() {
    if (playerRef.current) setCurrentTime(playerRef.current.currentTime)
  }
  function handleLoadedMeta() {
    if (playerRef.current) setDuration(playerRef.current.duration || sermon.duration_seconds || 0)
  }
  function togglePlay() {
    const v = playerRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }
  function handleScrubberClick(e) {
    if (!scrubberRef.current || !playerRef.current || !duration) return
    const rect = scrubberRef.current.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    playerRef.current.currentTime = Math.max(0, Math.min(duration, pct * duration))
  }
  function handleFullscreen() {
    const v = playerRef.current
    if (!v) return
    if (v.requestFullscreen) v.requestFullscreen()
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen() // iOS
  }

  const total = duration || sermon.duration_seconds || 1
  const pct = total ? (currentTime / total) * 100 : 0

  if (!sermon.source_video_url) {
    return (
      <div style={{
        aspectRatio: '16/9', borderRadius: 14,
        background: colors.surface, border: `1px dashed ${colors.line2}`,
        display: 'grid', placeItems: 'center',
        color: colors.muted, fontSize: 13, fontFamily: FONTS.sans,
      }}>
        No source video (audio-only sermon or older record)
      </div>
    )
  }

  return (
    <div style={{
      position: 'relative', aspectRatio: '16/9', borderRadius: 14,
      overflow: 'hidden', background: '#000', border: `1px solid ${colors.line2}`,
    }}>
      <video
        ref={playerRef}
        src={sermon.source_video_url}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMeta}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', background: '#000' }}
      />

      {/* "Now playing" pill — top-left */}
      {selectedClip && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '5px 10px',
          background: 'rgba(20,16,10,.65)', backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)', borderRadius: 999,
          fontSize: 11.5, color: colors.paper,
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: FONTS.sans, maxWidth: '60%',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 999,
            background: selectedClip.score === 'High' ? colors.high : colors.med,
            flexShrink: 0,
          }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Now playing: {selectedClip.title}
          </span>
        </div>
      )}

      {/* Transport bar — bottom */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, right: 12,
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
        background: 'rgba(20,16,10,.65)', backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)', borderRadius: 10,
      }}>
        <button onClick={togglePlay} style={{
          width: 32, height: 32, borderRadius: 999,
          background: colors.paper, border: 'none', cursor: 'pointer',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <Icon name={playing ? 'pause' : 'play'} size={13} color={colors.ink} />
        </button>
        <div style={{
          fontFamily: FONTS.mono, fontSize: 11, color: '#e8e2d6',
          minWidth: 110, flexShrink: 0,
        }}>
          {fmtHMS(currentTime)} / {fmtHMS(total)}
        </div>
        <div
          ref={scrubberRef}
          onClick={handleScrubberClick}
          style={{
            flex: 1, height: 6, background: 'rgba(255,255,255,.18)',
            borderRadius: 2, position: 'relative', cursor: 'pointer',
          }}
        >
          {/* progress */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct}%`, background: colors.paper, borderRadius: 2,
          }} />
          {/* clip markers */}
          {clips.map(c => (
            <div key={c.id} style={{
              position: 'absolute',
              left: `${(c.inSec / total) * 100}%`,
              width: `${((c.outSec - c.inSec) / total) * 100}%`,
              top: -2, bottom: -2,
              background: c.score === 'High'
                ? 'rgba(127,179,104,.7)'
                : 'rgba(231,183,104,.6)',
              borderRadius: 2, pointerEvents: 'none',
            }} />
          ))}
        </div>
        <Icon name="vol" size={14} color="#e8e2d6" />
        <button onClick={handleFullscreen} style={{
          background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer', display: 'grid', placeItems: 'center',
        }}>
          <Icon name="fullscreen" size={14} color="#e8e2d6" />
        </button>
      </div>
    </div>
  )
}

/* ---------- Clip-map strip ---------- */

function ClipMapStrip({ sermon, clips, selectedId, setSelectedId, playerRef }) {
  const total = sermon.duration_seconds || 1
  const [playhead, setPlayhead] = useState(0)
  useEffect(() => {
    if (!playerRef.current) return
    function tick() { setPlayhead(playerRef.current?.currentTime || 0) }
    const v = playerRef.current
    v.addEventListener('timeupdate', tick)
    return () => v.removeEventListener('timeupdate', tick)
  }, [playerRef])

  // Five evenly-spaced time labels (00:00, 10:00, 20:00, ..., total)
  const tickCount = 5
  const tickLabels = []
  for (let i = 0; i < tickCount - 1; i++) {
    tickLabels.push(fmtMMSS(Math.floor((total / (tickCount - 1)) * i / 60) * 60))
  }
  tickLabels.push(fmtMMSS(total))

  return (
    <div style={{
      padding: '10px 14px', border: `1px solid ${colors.line}`,
      borderRadius: 10, background: colors.card,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{
          fontSize: 10.5, color: colors.dim, textTransform: 'uppercase',
          letterSpacing: 1.2, fontFamily: FONTS.sans,
        }}>
          Sermon · clip map
        </span>
        <span style={{ fontSize: 11, color: colors.dim, fontFamily: FONTS.mono }}>
          {clips.length} clips found
        </span>
      </div>
      <div style={{ position: 'relative', height: 38, marginTop: 4 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: colors.line2 }} />
        {clips.map(c => {
          const left = (c.inSec / total) * 100
          const w = Math.max(1.4, ((c.outSec - c.inSec) / total) * 100)
          const isSel = c.id === selectedId
          const col = c.score === 'High' ? colors.high : colors.med
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              title={c.title}
              style={{
                position: 'absolute', left: `${left}%`, width: `${w}%`,
                top: isSel ? 4 : 12, bottom: isSel ? 4 : 12,
                background: col, border: 'none', borderRadius: 3, cursor: 'pointer',
                boxShadow: isSel ? `0 0 0 3px ${col}33` : 'none',
                transition: 'all .15s', padding: 0,
              }}
              aria-label={`Clip at ${fmtHMS(c.inSec)}: ${c.title}`}
            />
          )
        })}
        <div style={{
          position: 'absolute', left: `${(playhead / total) * 100}%`,
          top: 0, bottom: 0, width: 1.5, background: colors.ink, pointerEvents: 'none',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 4,
        fontFamily: FONTS.mono, fontSize: 10, color: colors.muted,
      }}>
        {tickLabels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  )
}

/* ---------- Left tabs ---------- */

function LeftTabs({ leftTab, setLeftTab }) {
  const tabs = [
    ['overview', 'Overview'],
    ['transcript', 'Transcript'],
    ['details', 'Render settings'],
  ]
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${colors.line}` }}>
      {tabs.map(([k, label]) => (
        <button key={k} onClick={() => setLeftTab(k)} style={{
          padding: '10px 14px', background: 'transparent', border: 'none',
          color: leftTab === k ? colors.ink : colors.dim, cursor: 'pointer',
          fontSize: 12.5, fontWeight: 500, fontFamily: FONTS.sans,
          borderBottom: `2px solid ${leftTab === k ? colors.ink : 'transparent'}`,
          marginBottom: -1,
        }}>
          {label}
        </button>
      ))}
    </div>
  )
}

function OverviewTab({ sermon, clips }) {
  const highCount = clips.filter(c => c.score === 'High').length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
      <Field label="Sermon" value={sermon.title} serif />
      <Field label="Client" value={sermon._clientName || sermon.client_id || '—'} />
      <Field label="Date" value={formatDateLong(sermon.sermon_date)} />
      <Field label="Duration" value={formatDuration(sermon.duration_seconds) || '—'} />
      <Field
        label="Clips found"
        value={`${clips.length}${highCount ? ` (${highCount} high)` : ''}`}
      />
      <Field label="Status" value={sermon.status === 'completed' ? 'Completed' : sermon.status} />
      <Field label="Render presets" value={summarizeRenderOptions(sermon.render_options)} span={2} />
    </div>
  )
}

function TranscriptTab({ sermon }) {
  if (!sermon.transcript) {
    return (
      <div style={{
        fontSize: 13, color: colors.muted, textAlign: 'center',
        padding: '2rem', fontFamily: FONTS.sans,
      }}>
        No transcript available yet
      </div>
    )
  }
  const wordCount = sermon.transcript.split(/\s+/).length
  return (
    <div>
      <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontFamily: FONTS.mono }}>
        {wordCount.toLocaleString()} words
      </div>
      <div style={{
        fontSize: 13.5, lineHeight: 1.75, color: colors.body,
        maxHeight: 480, overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        background: colors.card, border: `1px solid ${colors.line}`,
        borderRadius: 8, padding: '14px 18px',
        fontFamily: FONTS.sans,
      }}>
        {sermon.transcript}
      </div>
    </div>
  )
}

function DetailsTab({ sermon }) {
  const opts = sermon.render_options || {}
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
      <Field label="Output" value={opts.vertical ? 'Vertical 9:16' : 'Horizontal 16:9'} />
      <Field label="Face tracking" value={opts.vertical ? (opts.face_tracking === false ? 'Off (static center)' : 'AI auto-frame') : '—'} />
      <Field
        label="Lower-third"
        value={
          opts.crop_lower_third === true ? 'Cropped (forced)' :
          opts.crop_lower_third === false ? 'Not cropped' :
          opts.vertical ? 'Auto-detect' : '—'
        }
      />
      <Field label="Captions" value="Karaoke (auto-burned)" />
      <Field
        label="Processed at"
        value={sermon.processed_at ? new Date(sermon.processed_at).toLocaleString() : '—'}
      />
      <Field label="Status" value={sermon.status} />
    </div>
  )
}

function Field({ label, value, span, serif }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <div style={{
        fontSize: 10.5, color: colors.muted, textTransform: 'uppercase',
        letterSpacing: 1.2, marginBottom: 4, fontFamily: FONTS.sans,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: serif ? 16 : 13.5, color: colors.ink,
        fontFamily: serif ? FONTS.serif : FONTS.sans,
        fontWeight: serif ? 500 : 400, lineHeight: 1.55,
      }}>
        {value || '—'}
      </div>
    </div>
  )
}

/* ============================================================================
 * Right column — clip rail
 * ========================================================================== */

function RightColumn({
  allClips, visibleClips, sermon,
  filter, setFilter, sort, setSort, query, setQuery,
  expandedId, onToggle, onSelect, onFav, onArchive, onReprocess,
}) {
  async function handleDownloadAll() {
    for (const clip of visibleClips) {
      if (!clip.rendered_video_url) continue
      const a = document.createElement('a')
      a.href = clip.rendered_video_url
      a.download = `${slug(sermon.title || 'sermon')}-${clip.id.slice(0, 8)}.mp4`
      a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      await new Promise(r => setTimeout(r, 350))
    }
  }
  const hasAnyRendered = visibleClips.some(c => c.rendered_video_url)

  return (
    <div style={{
      borderLeft: `1px solid ${colors.line}`,
      display: 'flex', flexDirection: 'column', minWidth: 0,
      background: colors.bg,
    }}>
      {/* header */}
      <div style={{ padding: '20px 22px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
          <h2 style={{
            margin: 0, fontFamily: FONTS.serif, fontWeight: 500,
            fontSize: 22, color: colors.ink, letterSpacing: -0.2,
          }}>
            Clips
          </h2>
          <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: colors.dim }}>
            {visibleClips.length} of {allClips.length}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleDownloadAll}
            disabled={!hasAnyRendered}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
              background: colors.ink, color: colors.paper, border: 'none',
              borderRadius: 7, fontSize: 11.5, fontWeight: 500,
              cursor: hasAnyRendered ? 'pointer' : 'not-allowed',
              opacity: hasAnyRendered ? 1 : 0.5,
              fontFamily: FONTS.sans,
            }}
          >
            <Icon name="download" size={12} color={colors.paper} /> Download all
          </button>
        </div>

        {/* search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <div style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}>
            <Icon name="search" size={13} color={colors.muted} />
          </div>
          <input
            id="clip-search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search clip titles & transcripts…"
            style={{
              width: '100%', padding: '9px 12px 9px 34px', boxSizing: 'border-box',
              background: colors.card, border: `1px solid ${colors.line2}`,
              borderRadius: 8, fontSize: 12.5, color: colors.body, outline: 'none',
              fontFamily: FONTS.sans,
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {(() => {
            const opts = [
              ['all', 'All', allClips.length],
              ['high', 'High score', allClips.filter(c => c.score === 'High').length],
              ['starred', 'Starred', allClips.filter(c => c.fav).length],
            ]
            return opts.map(([k, label, count]) => {
              const on = filter === k
              return (
                <button key={k} onClick={() => setFilter(k)} style={{
                  padding: '4px 11px', borderRadius: 999, fontSize: 11.5,
                  cursor: 'pointer',
                  background: on ? colors.ink : colors.card,
                  color: on ? colors.paper : colors.body,
                  border: `1px solid ${on ? colors.ink : colors.line2}`,
                  fontWeight: on ? 600 : 400,
                  fontFamily: FONTS.sans,
                }}>
                  {label} <span style={{ opacity: 0.65, marginLeft: 4 }}>{count}</span>
                </button>
              )
            })
          })()}
          <div style={{ flex: 1 }} />
          <select value={sort} onChange={e => setSort(e.target.value)} style={{
            padding: '5px 10px', borderRadius: 7, fontSize: 11.5,
            fontFamily: FONTS.sans, background: colors.card,
            border: `1px solid ${colors.line2}`, color: colors.body,
            cursor: 'pointer', outline: 'none',
          }}>
            <option value="score">Sort: Score</option>
            <option value="length">Sort: Length</option>
            <option value="time">Sort: In sermon</option>
          </select>
        </div>
      </div>

      {/* accordion */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {visibleClips.map(c => (
          <ClipRow
            key={c.id}
            clip={c}
            sermonTitle={sermon.title}
            expanded={expandedId === c.id}
            onToggle={onToggle}
            onSelect={onSelect}
            onFav={onFav}
            onArchive={onArchive}
          />
        ))}
        {visibleClips.length === 0 && (
          <div style={{
            padding: 40, textAlign: 'center', color: colors.muted,
            fontSize: 13, fontFamily: FONTS.sans,
          }}>
            No clips match. Try clearing filters.
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Single clip row (collapsed + expanded) ---------- */

function ClipRow({ clip, sermonTitle, expanded, onToggle, onSelect, onFav, onArchive }) {
  const accent = clip.score === 'High' ? colors.high : colors.med
  const [copied, setCopied] = useState(null) // 'hook' | 'caption' | 'transcript' | null

  function copy(text, key) {
    if (!text) return
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }
  function handleDownload() {
    if (!clip.rendered_video_url) return
    const a = document.createElement('a')
    a.href = clip.rendered_video_url
    a.download = `${slug(sermonTitle || 'sermon')}-${clip.id.slice(0, 8)}.mp4`
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div style={{
      background: expanded ? colors.card : 'transparent',
      borderTop: `1px solid ${colors.line}`,
      transition: 'background .15s',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'flex-start', gap: 12, padding: '14px 16px',
      }}>
        <button
          onClick={() => onToggle(clip.id)}
          aria-expanded={expanded}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '4px 0', display: 'flex', alignItems: 'flex-start',
            color: colors.dim,
          }}
        >
          <Icon name={expanded ? 'chev' : 'chevR'} size={14} color={colors.dim} />
        </button>

        <button
          onClick={() => onToggle(clip.id)}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 0, textAlign: 'left', minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: colors.dim }}>
              {fmtHMS(clip.inSec)}
            </span>
            <span style={{ width: 3, height: 3, borderRadius: 999, background: colors.muted }} />
            <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: colors.dim }}>
              {clip.durSec}s
            </span>
            <span style={{ flex: 1 }} />
            <ScoreBadge accent={accent} score={clip.score} />
          </div>
          <div style={{
            fontSize: 14, fontWeight: 500, color: colors.ink,
            lineHeight: 1.35, fontFamily: FONTS.serif,
          }}>
            {clip.title}
          </div>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onFav(clip.id) }}
          style={{
            background: 'transparent', border: 'none', padding: 4,
            cursor: 'pointer', color: clip.fav ? colors.fav : colors.muted,
            alignSelf: 'flex-start',
          }}
          aria-label={clip.fav ? 'Unstar' : 'Star'}
        >
          <Icon name={clip.fav ? 'starFill' : 'star'} size={15} />
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px 42px' }}>
          {/* Rendered video preview (real, not the prototype's placeholder) */}
          {clip.rendered_video_url && (
            <div style={{ marginBottom: 10, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
              <video
                src={clip.rendered_video_url}
                controls
                preload="metadata"
                style={{ width: '100%', maxHeight: 360, display: 'block', objectFit: 'contain' }}
              />
            </div>
          )}

          {clip.render_error && !clip.rendered_video_url && (
            <div style={{
              padding: '10px 12px', fontSize: 12, marginBottom: 10,
              color: '#8b2929', background: '#fbecec', borderRadius: 6,
              fontFamily: FONTS.sans,
            }}>
              <strong>Render failed:</strong> {clip.render_error}
            </div>
          )}

          {!clip.rendered_video_url && !clip.render_error && (
            <div style={{
              padding: '10px 12px', fontSize: 12, marginBottom: 10,
              color: colors.dim, background: colors.surface, borderRadius: 6,
              fontFamily: FONTS.sans,
            }}>
              Not rendered yet — this clip came from a "Find more" re-roll. Render on demand is coming soon.
            </div>
          )}

          {/* Transcript pull-quote */}
          {clip.transcript && (
            <div style={{
              fontSize: 12.5, lineHeight: 1.55, color: colors.body,
              fontStyle: 'italic', padding: '10px 12px',
              borderLeft: `2px solid ${accent}`, background: colors.surface,
              borderRadius: '0 6px 6px 0', marginBottom: 10,
              fontFamily: FONTS.sans,
            }}>
              "{clip.transcript}"
            </div>
          )}

          {/* Caption preview */}
          {clip.suggested_caption && (
            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 10.5, color: colors.muted, textTransform: 'uppercase',
                letterSpacing: 1.2, marginBottom: 4, fontFamily: FONTS.sans,
              }}>
                Caption draft
              </div>
              <div style={{
                fontSize: 12.5, lineHeight: 1.55, color: colors.body,
                fontFamily: FONTS.sans,
              }}>
                {clip.suggested_caption}
              </div>
            </div>
          )}

          {/* Format chips */}
          {clip.formats?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {clip.formats.map(f => (
                <span key={f} style={{
                  padding: '2px 8px', border: `1px solid ${colors.line2}`,
                  borderRadius: 4, fontSize: 10.5, fontFamily: FONTS.mono,
                  color: colors.dim,
                }}>
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* Action row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Action icon="play" label="Play" onClick={() => onSelect(clip.id)} />
            <Action icon="edit" label="Trim" disabled title="Coming soon — needs render-on-demand backend" />
            <Action
              icon="copy"
              label={copied === 'hook' ? 'Copied' : 'Copy hook'}
              onClick={() => copy(clip.title, 'hook')}
              disabled={!clip.title}
            />
            <Action
              icon="copy"
              label={copied === 'caption' ? 'Copied' : 'Copy caption'}
              onClick={() => copy(clip.suggested_caption, 'caption')}
              disabled={!clip.suggested_caption}
            />
            <Action icon="share" label="Share" disabled title="Coming soon" />
            <Action
              icon="archive"
              label={clip.archived ? 'Unarchive' : 'Archive'}
              onClick={() => onArchive(clip.id)}
            />
            <div style={{ flex: 1 }} />
            <Action
              icon="download"
              label="Download"
              primary
              onClick={handleDownload}
              disabled={!clip.rendered_video_url}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ScoreBadge({ accent, score }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 500,
      background: `${accent}1f`, color: accent, fontFamily: FONTS.sans,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: accent }} />
      {score}
    </span>
  )
}

function Action({ icon, label, primary, onClick, disabled, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500,
        background: primary ? colors.ink : 'transparent',
        color: primary ? colors.paper : colors.body,
        border: `1px solid ${primary ? colors.ink : colors.line2}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: FONTS.sans,
      }}
    >
      <Icon name={icon} size={12} color={primary ? colors.paper : colors.body} />
      {label}
    </button>
  )
}

/* ============================================================================
 * Helpers — clip decoration, formatting
 * ========================================================================== */

function decorateClip(c, clipFlags, renderOptions) {
  const inSec = parseHMS(c.start_timestamp)
  const outSec = parseHMS(c.end_timestamp)
  const durSec = Math.max(0, Math.round(outSec - inSec))
  const strength = (c.strength || '').toLowerCase()
  const score = strength === 'high' ? 'High' : strength === 'medium' ? 'Medium' : 'Medium'
  const scoreNum = strength === 'high' ? 1.0 : strength === 'medium' ? 0.5 : 0.2
  const flags = clipFlags[c.clip_id] || {}
  // Format chips: we currently render one format per sermon. Surface the
  // one we know about so the chip row reads meaningfully.
  const formats = []
  if (renderOptions?.vertical) formats.push('9:16')
  else formats.push('16:9')
  return {
    id: c.clip_id,
    title: c.suggested_hook || c.transcript?.slice(0, 80) || 'Untitled clip',
    transcript: c.transcript || '',
    suggested_caption: c.suggested_caption || '',
    inSec, outSec, durSec,
    score, scoreNum,
    formats,
    rendered_video_url: c.rendered_video_url,
    render_error: c.render_error,
    start_timestamp: c.start_timestamp,
    end_timestamp: c.end_timestamp,
    fav: !!flags.fav,
    archived: !!flags.archived,
  }
}

function summarizeRenderOptions(opts) {
  if (!opts) return 'Default (horizontal)'
  const out = []
  if (opts.vertical) out.push('Vertical 9:16')
  else out.push('Horizontal 16:9')
  if (opts.vertical && opts.face_tracking !== false) out.push('AI face tracking')
  if (opts.vertical && opts.face_tracking === false) out.push('Static center crop')
  if (opts.crop_lower_third === true) out.push('Lower-third cropped')
  else if (opts.crop_lower_third === false) out.push('Lower-third kept')
  else if (opts.vertical) out.push('Lower-third auto-detect')
  return out.join(' · ')
}

function parseHMS(ts) {
  if (!ts) return 0
  const parts = ts.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function fmtHMS(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtMMSS(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDuration(seconds) {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function formatDateLong(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function slug(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'clip'
}
