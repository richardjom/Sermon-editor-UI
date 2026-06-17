import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Icon } from '../components/Icon.jsx'
import { Spinner, EmptyState } from '../components/ui.jsx'
import { getSermon, reprocessSermon, renderClip, createCustomClip, renderAllClips, updateRenderOptions, updateDeadline, markDelivered, unmarkDelivered, deleteSermon, transcriptPdfUrl, clipsPdfUrl } from '../api.js'

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
  // Set of clip_ids currently being re-rendered on-demand. We poll the
  // sermon while any of these are in flight and remove ids as their
  // rendered_video_url comes back updated.
  const [renderingClipIds, setRenderingClipIds] = useState(() => new Set())
  const pollingRef = useRef(null)
  const renderPollRef = useRef(null)

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

  // Deadline + delivered controls in the TopBar. Each one PATCHes
  // the backend and optimistically updates the local sermon copy so
  // the UI doesn't flicker waiting on the next /sermon/{id} fetch.
  async function handleUpdateDeadline(iso) {
    try {
      const res = await updateDeadline(sermonId, iso)
      setSermon(prev => prev
        ? { ...prev, service_datetime: res.service_datetime ?? null }
        : prev)
    } catch (e) {
      window.alert(`Could not update deadline: ${e.message || e}`)
      throw e
    }
  }

  async function handleMarkDelivered() {
    try {
      const res = await markDelivered(sermonId)
      setSermon(prev => prev
        ? { ...prev, delivered_at: res.delivered_at }
        : prev)
    } catch (e) {
      window.alert(`Could not mark delivered: ${e.message || e}`)
    }
  }

  async function handleUnmarkDelivered() {
    try {
      await unmarkDelivered(sermonId)
      setSermon(prev => prev ? { ...prev, delivered_at: null } : prev)
    } catch (e) {
      window.alert(`Could not restore to active: ${e.message || e}`)
    }
  }

  async function handleDelete() {
    if (!sermon) return
    const label = sermon.title || sermonId
    const ok = window.confirm(
      `Delete "${label}"?\n\nThis permanently removes the sermon, all its clips, and the source video / audio / rendered clips from storage. Notion pages stay. This cannot be undone.`
    )
    if (!ok) return
    try {
      await deleteSermon(sermonId)
      // Bounce back to wherever they came from — the sermon no longer exists.
      onBack?.()
    } catch (e) {
      window.alert(`Failed to delete: ${e.message || e}`)
    }
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

  // pendingRender drives the RenderOptionsModal. When non-null the modal
  // is open; the user picks vertical / face-tracking / crop and confirms
  // (or cancels). On confirm we PATCH the new options to the sermon and
  // then dispatch the actual render. Trim goes around the modal — it
  // already collected its own context (new in/out) and the user clearly
  // wants to render NOW with current settings.
  //
  // Shape:
  //   { kind: 'clip', clipId: '...' }
  //   { kind: 'all' }
  const [pendingRender, setPendingRender] = useState(null)

  // Actual render dispatchers (no modal). The "request" variants below
  // gate through the modal first; these are what runs after the user
  // confirms (or what runs directly for Trim).
  async function dispatchRenderClip(clipId, startSec, endSec) {
    setRenderingClipIds(prev => new Set(prev).add(clipId))
    try {
      await renderClip(clipId, {
        startSeconds: startSec, endSeconds: endSec,
      })
    } catch (e) {
      setRenderingClipIds(prev => {
        const next = new Set(prev); next.delete(clipId); return next
      })
      return
    }
    startRenderPoll()
  }

  async function dispatchRenderAll() {
    if (!sermon) return
    const targets = (sermon.clips || []).filter(c => !c.rendered_video_url)
    if (!targets.length) return
    setRenderingClipIds(prev => {
      const next = new Set(prev)
      for (const c of targets) next.add(c.clip_id)
      return next
    })
    try {
      await renderAllClips(sermonId, { onlyHigh: false })
    } catch (e) {
      setRenderingClipIds(prev => {
        const next = new Set(prev)
        for (const c of targets) next.delete(c.clip_id)
        return next
      })
      window.alert(`Failed to start bulk render: ${e.message || e}`)
      return
    }
    startRenderPoll()
  }

  // Route a per-clip render request through the options modal so the
  // user can pick vertical / face-tracking / crop on every render —
  // including Trim. Trim carries its new in/out times through
  // pendingRender; the modal's confirm handler passes them to
  // dispatchRenderClip alongside the picked options. (This used to
  // skip the modal on Trim, but the user needs the AI-tracking knob
  // there too — a long clip with face_tracking on can OOM Railway,
  // and Trim is exactly the moment to retry it differently.)
  function handleRenderClipRequest(clipId, startSec, endSec) {
    const isTrim = typeof startSec === 'number' && typeof endSec === 'number'
    setPendingRender(isTrim
      ? { kind: 'clip', clipId, startSec, endSec }
      : { kind: 'clip', clipId })
  }

  // "Render all" always goes through the modal (no per-clip overrides
  // to skip with).
  function handleRenderAllRequest() {
    setPendingRender({ kind: 'all' })
  }

  // The modal calls this on confirm. PATCH the new options to the
  // sermon (so the saved defaults stay in sync), then dispatch the
  // pending render. The modal closes on success; on failure the
  // modal stays open and surfaces the error.
  async function handleConfirmRender(optsPatch) {
    if (!pendingRender) return
    await handlePatchRenderOptions(optsPatch)
    const p = pendingRender
    setPendingRender(null)
    if (p.kind === 'clip') {
      // p.startSec / p.endSec are present only on the Trim path.
      await dispatchRenderClip(p.clipId, p.startSec, p.endSec)
    } else if (p.kind === 'all') {
      await dispatchRenderAll()
    }
  }

  // Patch the sermon's render_options. Partial: only the fields in
  // `patch` are written, others stay. After success, optimistically
  // update the local sermon copy so toggles feel instant — no need to
  // round-trip a full GET /sermon/{id}.
  async function handlePatchRenderOptions(patch) {
    try {
      const result = await updateRenderOptions(sermonId, patch)
      setSermon(prev => prev ? { ...prev, render_options: result.render_options } : prev)
      return result
    } catch (e) {
      window.alert(`Failed to update render options: ${e.message || e}`)
      throw e
    }
  }

  // Create a custom clip at a user-supplied range. The backend snaps
  // to word boundaries and inserts a Clip row; we reload the sermon so
  // the new clip shows up, and if render was requested, mark it
  // rendering so the poll picks it up.
  async function handleCreateCustomClip(form) {
    const created = await createCustomClip(sermonId, form)
    const newId = created?.clip_id
    if (form.render && newId) {
      setRenderingClipIds(prev => new Set(prev).add(newId))
      startRenderPoll()
    }
    await load()
    return created
  }

  // Poll the sermon every 5s while any clip is rendering. When a clip's
  // rendered_video_url changes (or render_error appears), remove it from
  // the rendering set. Stop polling when nothing is in flight.
  function startRenderPoll() {
    if (renderPollRef.current) return
    renderPollRef.current = setInterval(async () => {
      try {
        const s = await getSermon(sermonId)
        const client = clients.find(c => c.id === (clientId || s.client_id))
        setSermon({ ...s, _clientName: client?.name })
        setRenderingClipIds(prev => {
          if (!prev.size) return prev
          const next = new Set(prev)
          for (const cid of prev) {
            const c = (s.clips || []).find(x => x.clip_id === cid)
            if (c && (c.rendered_video_url || c.render_error)) {
              next.delete(cid)
            }
          }
          if (next.size === 0) stopRenderPoll()
          return next
        })
      } catch {}
    }, 5000)
  }
  function stopRenderPoll() {
    if (renderPollRef.current) {
      clearInterval(renderPollRef.current); renderPollRef.current = null
    }
  }
  useEffect(() => () => stopRenderPoll(), [])

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      background: colors.bg, color: colors.body,
      fontFamily: FONTS.sans, fontSize: 13,
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <TopBar
        sermon={sermon}
        sermonId={sermonId}
        onBack={onBack}
        onReprocess={handleReprocess}
        onUpdateDeadline={handleUpdateDeadline}
        onMarkDelivered={handleMarkDelivered}
        onUnmarkDelivered={handleUnmarkDelivered}
        onDelete={handleDelete}
      />

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
          sermonId={sermonId}
          clipFlags={clipFlags}
          renderingClipIds={renderingClipIds}
          onToggleFav={toggleFav}
          onToggleArchived={toggleArchived}
          onReprocess={handleReprocess}
          onRenderClip={handleRenderClipRequest}
          onCreateCustomClip={handleCreateCustomClip}
          onRenderAll={handleRenderAllRequest}
        />
      )}

      {pendingRender && sermon && (
        <RenderOptionsModal
          sermon={sermon}
          pending={pendingRender}
          onClose={() => setPendingRender(null)}
          onConfirm={handleConfirmRender}
        />
      )}
    </div>
  )
}

/* ============================================================================
 * Top bar
 * ========================================================================== */

function TopBar({ sermon, sermonId, onBack, onReprocess, onUpdateDeadline, onMarkDelivered, onUnmarkDelivered, onDelete }) {
  const [deadlineOpen, setDeadlineOpen] = useState(false)
  const meta = sermon
    ? [sermon._clientName || sermon.client_id, formatDate(sermon.sermon_date), formatDuration(sermon.duration_seconds)]
        .filter(Boolean).join(' · ')
    : ''
  const isDelivered = !!sermon?.delivered_at
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
      {sermon && onUpdateDeadline && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setDeadlineOpen(v => !v)}
            title="Click to change the deadline"
            style={{
              background: colors.card, border: `1px solid ${colors.line2}`,
              color: colors.body, padding: '6px 12px', borderRadius: 8,
              fontSize: 12, cursor: 'pointer', fontFamily: FONTS.sans,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ color: colors.dim, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 500 }}>
              Deadline
            </span>
            <span style={{ color: colors.ink, fontWeight: 500 }}>
              {sermon.service_datetime
                ? formatDateLong(sermon.service_datetime)
                : 'Not set'}
            </span>
          </button>
          {deadlineOpen && (
            <BriefDeadlinePopover
              currentISO={sermon.service_datetime}
              onClose={() => setDeadlineOpen(false)}
              onSave={async (iso) => {
                await onUpdateDeadline(iso)
                setDeadlineOpen(false)
              }}
            />
          )}
        </div>
      )}
      {sermon && <StatusPill status={sermon.status} delivered={isDelivered} />}
      {sermon?.status === 'completed' && !isDelivered && onMarkDelivered && (
        <button
          onClick={onMarkDelivered}
          title="Stamp this sermon as delivered to the client — drops it from the active dashboard queue."
          style={{
            background: colors.high, border: 'none',
            color: colors.paper, padding: '8px 14px', borderRadius: 8,
            fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: FONTS.sans,
          }}
        >
          Mark delivered
        </button>
      )}
      {isDelivered && onUnmarkDelivered && (
        <button
          onClick={onUnmarkDelivered}
          title="Bring this sermon back into the active dashboard queue."
          style={{
            background: 'transparent', border: `1px solid ${colors.line2}`,
            color: colors.body, padding: '8px 14px', borderRadius: 8,
            fontSize: 12.5, cursor: 'pointer', fontFamily: FONTS.sans,
          }}
        >
          Restore to active
        </button>
      )}
      {sermon?.status === 'completed' && (
        <button onClick={onReprocess} style={{
          background: 'transparent', border: `1px solid ${colors.line2}`,
          color: colors.body, padding: '8px 14px', borderRadius: 8,
          fontSize: 12.5, cursor: 'pointer', fontFamily: FONTS.sans,
        }}>
          Reprocess
        </button>
      )}
      {sermon && onDelete && (
        <button
          onClick={onDelete}
          title="Delete sermon permanently — removes DB row, clips, and R2 storage."
          aria-label="Delete sermon"
          style={{
            background: 'transparent', border: `1px solid ${colors.line2}`,
            color: colors.dim, padding: '8px 10px', borderRadius: 8,
            cursor: 'pointer', fontFamily: FONTS.sans,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color 0.12s, background 0.12s, border-color 0.12s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'
            e.currentTarget.style.color = '#b8423b'
            e.currentTarget.style.borderColor = 'rgba(184, 66, 59, 0.4)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = colors.dim
            e.currentTarget.style.borderColor = colors.line2
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M6 4V2.5A.5.5 0 016.5 2h3a.5.5 0 01.5.5V4M5 4l.7 9a1 1 0 001 .9h2.6a1 1 0 001-.9L11 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  )
}

function BriefDeadlinePopover({ currentISO, onClose, onSave }) {
  const initialDate = useMemo(() => {
    if (currentISO) {
      try { return new Date(currentISO).toISOString().slice(0, 10) } catch {}
    }
    return new Date().toISOString().slice(0, 10)
  }, [currentISO])
  const [date, setDate] = useState(initialDate)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const popRef = useRef(null)

  useEffect(() => {
    function down(e) {
      if (popRef.current && !popRef.current.contains(e.target)) onClose()
    }
    function key(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])

  async function commit(value) {
    setError('')
    setSubmitting(true)
    try {
      await onSave(value)
    } catch (e) {
      setError(e?.message || 'Failed to save')
      setSubmitting(false)
    }
  }

  return (
    <div
      ref={popRef}
      style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 6,
        zIndex: 50, background: colors.card,
        border: `1px solid ${colors.line2}`, borderRadius: 10,
        boxShadow: '0 4px 16px rgba(20,16,10,0.08)',
        padding: 12, width: 240, fontFamily: FONTS.sans,
      }}
    >
      <div style={{
        fontSize: 10.5, color: colors.muted, textTransform: 'uppercase',
        letterSpacing: 1.2, marginBottom: 6,
      }}>
        Change deadline
      </div>
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        disabled={submitting}
        autoFocus
        style={{
          width: '100%', padding: '7px 9px', boxSizing: 'border-box',
          background: '#fff', border: `1px solid ${colors.line2}`,
          borderRadius: 6, fontSize: 13, fontFamily: FONTS.sans,
          color: colors.ink, outline: 'none',
        }}
      />
      {error && (
        <div style={{
          fontSize: 11.5, color: '#8b2929', background: '#fbecec',
          padding: '6px 8px', borderRadius: 6, marginTop: 8,
        }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
        {currentISO && (
          <button
            type="button"
            onClick={() => commit(null)}
            disabled={submitting}
            title="Remove the deadline"
            style={{
              background: 'transparent', color: colors.dim,
              border: 'none', padding: '6px 4px', fontSize: 11.5,
              cursor: submitting ? 'wait' : 'pointer', fontFamily: FONTS.sans,
            }}
          >
            Clear
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          style={{
            background: 'transparent', color: colors.body,
            border: `1px solid ${colors.line2}`, padding: '6px 12px',
            borderRadius: 6, fontSize: 12, cursor: submitting ? 'wait' : 'pointer',
            fontFamily: FONTS.sans,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => commit(date ? `${date}T09:00:00` : null)}
          disabled={submitting}
          style={{
            background: colors.ink, color: colors.paper, border: 'none',
            padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            cursor: submitting ? 'wait' : 'pointer', fontFamily: FONTS.sans,
          }}
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function StatusPill({ status, delivered }) {
  const map = {
    completed: { c: colors.high, label: 'Completed' },
    processing: { c: '#a07a26', label: 'Processing' },
    failed: { c: '#a23b3b', label: 'Failed' },
    pending: { c: colors.dim, label: 'Pending' },
    analyzing: { c: '#a07a26', label: 'Analyzing' },
    transcribing: { c: '#a07a26', label: 'Transcribing' },
  }
  // Delivered overrides everything else — the editor cares more about
  // "is this off my queue" than about whether each clip rendered.
  const s = delivered
    ? { c: colors.high, label: 'Delivered' }
    : (map[status] || { c: colors.dim, label: status || '—' })
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

function Body({ sermon, sermonId, clipFlags, renderingClipIds, onToggleFav, onToggleArchived, onReprocess, onRenderClip, onCreateCustomClip, onRenderAll }) {
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

  // Bumped each time the user clicks the Play action on a clip row.
  // VideoPlayer watches this counter and (re)seeks + plays. Decoupled
  // from selectedId so clicking Play on the already-selected clip
  // restarts it instead of being a no-op.
  const [playToken, setPlayToken] = useState(0)
  function onPlayClip(id) {
    setSelectedId(id)
    setExpandedId(id)
    setPlayToken(t => t + 1)
  }
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
        playToken={playToken}
      />
      <RightColumn
        allClips={allClips}
        visibleClips={visibleClips}
        sermon={sermon}
        sermonId={sermonId}
        renderingClipIds={renderingClipIds}
        filter={filter} setFilter={setFilter}
        sort={sort} setSort={setSort}
        query={query} setQuery={setQuery}
        expandedId={expandedId}
        onToggle={(id) => {
          setExpandedId(prev => (prev === id ? null : id))
          setSelectedId(id)
        }}
        onSelect={(id) => setSelectedId(id)}
        onPlay={onPlayClip}
        onFav={onToggleFav}
        onArchive={onToggleArchived}
        onReprocess={onReprocess}
        onRenderClip={onRenderClip}
        onCreateCustomClip={onCreateCustomClip}
        onRenderAll={onRenderAll}
      />
    </div>
  )
}

/* ============================================================================
 * Left column — video, clip-map strip, tabs
 * ========================================================================== */

function LeftColumn({ sermon, clips, selectedClip, selectedId, setSelectedId, leftTab, setLeftTab, playerRef, playToken }) {
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
        playToken={playToken}
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

function VideoPlayer({ sermon, clips, selectedClip, selectedId, playerRef, playToken }) {
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

  // When the user clicks the Play action on a clip row (which bumps
  // playToken), seek to that clip's start AND start playback. Decoupled
  // from selectedId so clicking Play on the already-selected clip
  // restarts it instead of being a no-op.
  useEffect(() => {
    if (playToken && selectedClip && playerRef.current) {
      const v = playerRef.current
      v.currentTime = Math.max(0, selectedClip.inSec + 0.05)
      const p = v.play()
      if (p && typeof p.catch === 'function') {
        // Autoplay can be blocked by the browser if the user hasn't
        // interacted yet. Swallow the rejection — the user can press
        // the main Play button to recover.
        p.catch(() => {})
      }
    }
  }, [playToken])  // eslint-disable-line react-hooks/exhaustive-deps

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
  // Read-only view of the sermon's current render settings (the
  // defaults that the next Render now / Render all will start from).
  // Editing happens in the RenderOptionsModal that pops up when the
  // user clicks Render now or Render all — not here. This tab just
  // confirms the current state.
  const opts = sermon.render_options || {}
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ fontSize: 12, color: colors.body, lineHeight: 1.55 }}>
        These are the current render defaults for this sermon. Change
        them on the next Render now / Render all — the modal will
        pre-fill with these values.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <Field label="Output" value={opts.vertical ? 'Vertical 9:16' : 'Horizontal 16:9'} />
        <Field
          label="Face tracking"
          value={
            opts.vertical
              ? (opts.face_tracking === false ? 'Off (static center)' : 'AI auto-frame')
              : '—'
          }
        />
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
    </div>
  )
}

function DetailToggle({ checked, onChange, disabled, label, hint }) {
  return (
    <label style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      cursor: disabled ? 'wait' : 'pointer',
      opacity: disabled ? 0.7 : 1,
    }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3, accentColor: colors.ink, cursor: 'inherit' }}
      />
      <div>
        <div style={{ fontSize: 13, color: colors.ink, fontFamily: FONTS.sans }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 11.5, color: colors.dim, marginTop: 2, lineHeight: 1.45 }}>
            {hint}
          </div>
        )}
      </div>
    </label>
  )
}

function DetailSegmented({ value, onChange, disabled, options }) {
  return (
    <div
      role="radiogroup"
      style={{
        display: 'inline-flex',
        border: `1px solid ${colors.line2}`,
        borderRadius: 7, overflow: 'hidden',
        background: colors.card,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.value)}
            style={{
              padding: '6px 14px',
              fontSize: 12, fontWeight: 500,
              border: 'none',
              borderLeft: i === 0 ? 'none' : `1px solid ${colors.line2}`,
              background: selected ? colors.ink : 'transparent',
              color: selected ? colors.paper : colors.body,
              cursor: disabled ? 'wait' : 'pointer',
              fontFamily: FONTS.sans,
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
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
  allClips, visibleClips, sermon, sermonId, renderingClipIds,
  filter, setFilter, sort, setSort, query, setQuery,
  expandedId, onToggle, onSelect, onPlay, onFav, onArchive, onReprocess, onRenderClip,
  onCreateCustomClip, onRenderAll,
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

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
  const unrenderedCount = allClips.filter(c => !c.rendered_video_url).length

  async function handleBulkRender() {
    if (bulkBusy || !onRenderAll) return
    setBulkBusy(true)
    try {
      await onRenderAll({ onlyHigh: false })
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div style={{
      borderLeft: `1px solid ${colors.line}`,
      display: 'flex', flexDirection: 'column', minWidth: 0,
      background: colors.bg,
    }}>
      {/* header */}
      <div style={{ padding: '20px 22px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
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
          {onCreateCustomClip && (
            <button
              onClick={() => setCustomOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                background: colors.card, color: colors.ink,
                border: `1px solid ${colors.line2}`,
                borderRadius: 7, fontSize: 11.5, fontWeight: 500,
                cursor: 'pointer', fontFamily: FONTS.sans,
              }}
              title="Create a clip at custom in/out times"
            >
              + Custom clip
            </button>
          )}
          {onRenderAll && unrenderedCount > 0 && (
            <button
              onClick={handleBulkRender}
              disabled={bulkBusy}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                background: colors.card, color: colors.ink,
                border: `1px solid ${colors.line2}`,
                borderRadius: 7, fontSize: 11.5, fontWeight: 500,
                cursor: bulkBusy ? 'wait' : 'pointer',
                opacity: bulkBusy ? 0.6 : 1,
                fontFamily: FONTS.sans,
              }}
              title="Render every clip that's not yet rendered, one at a time"
            >
              <Icon name="play" size={12} color={colors.ink} />
              {bulkBusy ? 'Queuing…' : `Render ${unrenderedCount} unrendered`}
            </button>
          )}
          {/* PDF export buttons — backend builds and streams via
              Content-Disposition: attachment, so a plain anchor with
              `download` triggers the browser's Save dialog. We use <a>
              (not <button> + window.location) so users can also
              right-click → "Open in new tab" if they want to preview. */}
          {sermonId && (sermon?.transcript || allClips.length > 0) && (
            <a
              href={transcriptPdfUrl(sermonId)}
              download
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                background: colors.card, color: colors.ink,
                border: `1px solid ${colors.line2}`,
                borderRadius: 7, fontSize: 11.5, fontWeight: 500,
                cursor: 'pointer', fontFamily: FONTS.sans,
                textDecoration: 'none',
              }}
              title="Download the full sermon transcript as a PDF"
            >
              <Icon name="download" size={12} color={colors.ink} /> Transcript
            </a>
          )}
          {sermonId && visibleClips.length > 0 && (
            <a
              href={clipsPdfUrl(sermonId, visibleClips.map(c => c.id))}
              download
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                background: colors.card, color: colors.ink,
                border: `1px solid ${colors.line2}`,
                borderRadius: 7, fontSize: 11.5, fontWeight: 500,
                cursor: 'pointer', fontFamily: FONTS.sans,
                textDecoration: 'none',
              }}
              title={`Download the ${visibleClips.length} visible clip${visibleClips.length !== 1 ? 's' : ''} as a PDF (title, hook, caption, and transcript per clip)`}
            >
              <Icon name="download" size={12} color={colors.ink} /> Clip doc
            </a>
          )}
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
            rendering={renderingClipIds?.has(c.id)}
            onToggle={onToggle}
            onSelect={onSelect}
            onPlay={onPlay}
            onFav={onFav}
            onArchive={onArchive}
            onRender={(id) => onRenderClip?.(id)}
            onTrim={(id, startSec, endSec) => onRenderClip?.(id, startSec, endSec)}
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

      {customOpen && (
        <CustomClipModal
          sermon={sermon}
          onClose={() => setCustomOpen(false)}
          onConfirm={async (form) => {
            try {
              await onCreateCustomClip?.(form)
              setCustomOpen(false)
            } catch (e) {
              // CustomClipModal surfaces the error inline.
              throw e
            }
          }}
        />
      )}
    </div>
  )
}

/* ---------- Single clip row (collapsed + expanded) ---------- */

function ClipRow({ clip, sermonTitle, expanded, onToggle, onSelect, onPlay, onFav, onArchive, onRender, onTrim, rendering }) {
  const accent = clip.score === 'High' ? colors.high : colors.med
  const [copied, setCopied] = useState(null) // 'hook' | 'caption' | 'transcript' | null
  const [trimOpen, setTrimOpen] = useState(false)

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

          {clip.render_error && !clip.rendered_video_url && !rendering && (
            <div style={{
              padding: '10px 12px', fontSize: 12, marginBottom: 10,
              color: '#8b2929', background: '#fbecec', borderRadius: 6,
              fontFamily: FONTS.sans,
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>Render failed</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.45, color: '#8b2929', wordBreak: 'break-word' }}>
                  {clip.render_error}
                </div>
              </div>
              <button
                onClick={() => onRender(clip.id)}
                title="Re-attempt the render with the current settings, or change them in the modal that pops up."
                style={{
                  background: colors.ink, color: colors.paper, border: 'none',
                  padding: '6px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONTS.sans, whiteSpace: 'nowrap',
                  alignSelf: 'center',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {!clip.rendered_video_url && !clip.render_error && !rendering && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', fontSize: 12, marginBottom: 10,
              color: colors.dim, background: colors.surface, borderRadius: 6,
              fontFamily: FONTS.sans,
            }}>
              <span style={{ flex: 1 }}>Not rendered yet — Find more re-roll. Render this clip now?</span>
              <button
                onClick={() => onRender(clip.id)}
                style={{
                  background: colors.ink, color: colors.paper, border: 'none',
                  padding: '5px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500,
                  cursor: 'pointer', fontFamily: FONTS.sans,
                }}
              >
                Render now
              </button>
            </div>
          )}

          {rendering && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', fontSize: 12, marginBottom: 10,
              color: colors.dim, background: colors.surface, borderRadius: 6,
              fontFamily: FONTS.sans,
            }}>
              <Spinner size={14} />
              <span>Rendering this clip… takes 30-60 seconds.</span>
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
            <Action icon="play" label="Play" onClick={() => onPlay?.(clip.id)} />
            <Action
              icon="edit"
              label="Trim"
              onClick={() => setTrimOpen(true)}
              disabled={rendering}
              title={rendering ? 'Wait for current render to finish' : 'Adjust in/out times and re-render'}
            />
            <Action
              icon="copy"
              label={copied === 'hook' ? 'Copied' : 'Copy hook'}
              onClick={() => copy(clip.suggested_hook || clip.title, 'hook')}
              disabled={!(clip.suggested_hook || clip.title)}
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

      {trimOpen && (
        <TrimModal
          clip={clip}
          onClose={() => setTrimOpen(false)}
          onConfirm={(startSec, endSec) => {
            setTrimOpen(false)
            onTrim(clip.id, startSec, endSec)
          }}
        />
      )}
    </div>
  )
}

function TrimModal({ clip, onClose, onConfirm }) {
  // The clip's stored times come back as HH:MM:SS strings. Edit them
  // as text inputs — easier than two scrubbers, and faithful to how
  // the rest of the UI displays time.
  const [startStr, setStartStr] = useState(clip.start_timestamp || fmtHMS(clip.inSec))
  const [endStr, setEndStr] = useState(clip.end_timestamp || fmtHMS(clip.outSec))
  const [error, setError] = useState('')

  function submit() {
    const s = parseHMS(startStr)
    const e = parseHMS(endStr)
    if (!isFinite(s) || !isFinite(e)) {
      setError('Use HH:MM:SS for both times.')
      return
    }
    if (e <= s) {
      setError('End time must be after start time.')
      return
    }
    if (e - s > 180) {
      setError('Clips longer than 3 minutes are not supported.')
      return
    }
    onConfirm(s, e)
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,16,10,0.4)',
        display: 'grid', placeItems: 'center', zIndex: 100,
      }}
    >
      <div style={{
        background: colors.card, borderRadius: 12,
        border: `1px solid ${colors.line2}`,
        width: 420, maxWidth: '95vw',
        fontFamily: FONTS.sans,
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${colors.line}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>Trim clip</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: colors.dim, fontSize: 18, padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: colors.body, marginBottom: 12, lineHeight: 1.5 }}>
            Adjust the in/out times (HH:MM:SS) and re-render this clip.
            The rendered video will replace the current one when ready.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <TrimField label="Start" value={startStr} onChange={setStartStr} />
            <TrimField label="End" value={endStr} onChange={setEndStr} />
          </div>
          {error && (
            <div style={{
              fontSize: 12, color: '#8b2929', background: '#fbecec',
              padding: '8px 10px', borderRadius: 6, marginBottom: 12,
            }}>{error}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <Action label="Cancel" icon="x" onClick={onClose} />
            <Action label="Trim & re-render" icon="scissors" primary onClick={submit} />
          </div>
        </div>
      </div>
    </div>
  )
}

function CustomClipModal({ sermon, onClose, onConfirm }) {
  const [startStr, setStartStr] = useState('00:00:00')
  const [endStr, setEndStr] = useState('00:01:00')
  const [title, setTitle] = useState('')
  const [renderNow, setRenderNow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const durationStr = sermon?.duration_seconds
    ? `Sermon length ${fmtHMS(sermon.duration_seconds)}`
    : null

  async function submit() {
    setError('')
    const s = parseHMS(startStr)
    const e = parseHMS(endStr)
    if (!isFinite(s) || !isFinite(e)) {
      setError('Use HH:MM:SS for both times.')
      return
    }
    if (s < 0) {
      setError('Start time cannot be negative.')
      return
    }
    if (e <= s) {
      setError('End time must be after start time.')
      return
    }
    if (sermon?.duration_seconds && e > sermon.duration_seconds + 1) {
      setError(`End time exceeds sermon length (${fmtHMS(sermon.duration_seconds)}).`)
      return
    }
    setSubmitting(true)
    try {
      await onConfirm({
        startSeconds: s,
        endSeconds: e,
        title: title.trim() || undefined,
        render: renderNow,
      })
    } catch (err) {
      setError(err?.message || String(err))
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,16,10,0.4)',
        display: 'grid', placeItems: 'center', zIndex: 100,
      }}
    >
      <div style={{
        background: colors.card, borderRadius: 12,
        border: `1px solid ${colors.line2}`,
        width: 460, maxWidth: '95vw',
        fontFamily: FONTS.sans,
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${colors.line}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>Create custom clip</div>
          <button onClick={onClose} disabled={submitting} style={{
            background: 'none', border: 'none', cursor: submitting ? 'wait' : 'pointer',
            color: colors.dim, fontSize: 18, padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: colors.body, marginBottom: 12, lineHeight: 1.5 }}>
            Pick the start and end times in the sermon (HH:MM:SS). The clip
            snaps to the nearest word boundaries and pulls the transcript
            from those words.
            {durationStr && (
              <span style={{ color: colors.dim }}> · {durationStr}</span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <TrimField label="Start" value={startStr} onChange={setStartStr} />
            <TrimField label="End" value={endStr} onChange={setEndStr} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10.5, color: colors.muted, textTransform: 'uppercase',
              letterSpacing: 1.2, marginBottom: 4,
            }}>
              Title (optional)
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-derived from first words if blank"
              style={{
                width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                background: '#fff', border: `1px solid ${colors.line2}`,
                borderRadius: 6, fontSize: 13, fontFamily: FONTS.sans,
                color: colors.ink, outline: 'none',
              }}
            />
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            fontSize: 12.5, color: colors.body, marginBottom: 12,
          }}>
            <input
              type="checkbox"
              checked={renderNow}
              onChange={(e) => setRenderNow(e.target.checked)}
              style={{ accentColor: colors.high, cursor: 'pointer' }}
            />
            Render immediately after creating
          </label>
          {error && (
            <div style={{
              fontSize: 12, color: '#8b2929', background: '#fbecec',
              padding: '8px 10px', borderRadius: 6, marginBottom: 12,
            }}>{error}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <Action label="Cancel" icon="x" onClick={onClose} disabled={submitting} />
            <Action
              label={submitting ? 'Creating…' : 'Create clip'}
              icon="plus"
              primary
              onClick={submit}
              disabled={submitting}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function TrimField({ label, value, onChange }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5, color: colors.muted, textTransform: 'uppercase',
        letterSpacing: 1.2, marginBottom: 4,
      }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="HH:MM:SS"
        style={{
          width: '100%', padding: '8px 10px', boxSizing: 'border-box',
          background: '#fff', border: `1px solid ${colors.line2}`,
          borderRadius: 6, fontSize: 13, fontFamily: FONTS.mono,
          color: colors.ink, outline: 'none',
        }}
      />
    </div>
  )
}

// Mirror of backend app/services/captions.py CAPTION_TEMPLATES. Keep
// in sync when adding/removing templates. Frontend doesn't need the
// full style block, just the picker-display metadata.
const CAPTION_TEMPLATES_UI = [
  { value: 'uppercase_reveal', label: 'Bold Caps — Word Reveal', description: 'ALL CAPS bold white, each word pops in as it\'s spoken. No color shift.' },
  { value: 'uppercase_yellow', label: 'Bold Caps — Yellow',      description: 'ALL CAPS bold sans, yellow karaoke highlight on white. Furtick-style.' },
  { value: 'uppercase_white',  label: 'Bold Caps — White',       description: 'ALL CAPS bold sans, single-color white (no karaoke highlight). Clean stage look.' },
  { value: 'uppercase_no_outline', label: 'Bold Caps — No Outline', description: 'ALL CAPS bold white, no outline (soft shadow only for legibility).' },
  { value: 'uppercase_reveal_no_outline', label: 'Bold Caps — Reveal, No Outline', description: 'ALL CAPS bold white, no outline, each word pops in as it\'s spoken.' },
  { value: 'bold_yellow',      label: 'Bold Yellow',             description: 'Mixed case — yellow karaoke highlight on white.' },
  { value: 'clean_white',      label: 'Clean White',             description: 'Minimal — white active on dim gray, lighter outline.' },
  { value: 'brand',            label: 'Brand',                   description: 'Your brand color as the highlight (set hex below).' },
  { value: 'bold_punch',       label: 'Bold Punch',              description: 'Big, heavy, high-contrast — Mr. Beast / stadium.' },
  { value: 'serif_editorial',  label: 'Serif Editorial',         description: 'Calmer — serif font, smaller, soft gray inactive.' },
]

function RenderOptionsModal({ sermon, pending, onClose, onConfirm }) {
  // Pre-fill from the sermon's current saved options so the user sees
  // what would happen if they hit Render right now. Each render flow
  // pops this modal — they can tweak and confirm, the new options
  // PATCH back to the sermon (sticky for next time) and the render
  // fires.
  const initial = sermon?.render_options || {}
  const [vertical, setVertical] = useState(!!initial.vertical)
  const [faceTracking, setFaceTracking] = useState(initial.face_tracking !== false)
  const [crop, setCrop] = useState(
    initial.crop_lower_third === true ? 'on' :
    initial.crop_lower_third === false ? 'off' :
    'auto'
  )
  const [captionTemplate, setCaptionTemplate] = useState(initial.caption_template || 'bold_yellow')
  const [brandColor, setBrandColor] = useState(initial.brand_color || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isAll = pending?.kind === 'all'
  const isTrim = !isAll && (
    typeof pending?.startSec === 'number' && typeof pending?.endSec === 'number'
  )
  const clip = !isAll
    ? (sermon?.clips || []).find(c => c.clip_id === pending?.clipId)
    : null
  const unrenderedCount = isAll
    ? (sermon?.clips || []).filter(c => !c.rendered_video_url).length
    : 0

  const title = isAll
    ? `Render ${unrenderedCount} unrendered clip${unrenderedCount !== 1 ? 's' : ''}`
    : isTrim
      ? `Trim & re-render — ${fmtHMS(pending.startSec)} → ${fmtHMS(pending.endSec)}`
      : 'Render this clip'

  async function submit() {
    setError('')
    // brand_color validation only matters if the brand template is selected.
    if (captionTemplate === 'brand' && brandColor) {
      const ok = /^#?[0-9a-fA-F]{6}$/.test(brandColor.trim())
      if (!ok) {
        setError('Brand color must be 6-digit hex (e.g. #FF5733).')
        return
      }
    }
    setSubmitting(true)
    try {
      const payload = {
        vertical,
        face_tracking: faceTracking,
        crop_lower_third: crop === 'auto' ? null : crop === 'on',
        caption_template: captionTemplate || 'bold_yellow',
      }
      // Only send brand_color when relevant — keeps PATCH clean.
      if (captionTemplate === 'brand') {
        payload.brand_color = brandColor
          ? (brandColor.startsWith('#') ? brandColor : `#${brandColor}`)
          : null
      }
      await onConfirm(payload)
      // Parent closes the modal on success.
    } catch (e) {
      setError(e?.message || String(e))
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,16,10,0.4)',
        display: 'grid', placeItems: 'center', zIndex: 100,
      }}
    >
      <div style={{
        background: colors.card, borderRadius: 12,
        border: `1px solid ${colors.line2}`,
        width: 480, maxWidth: '95vw',
        fontFamily: FONTS.sans,
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${colors.line}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>{title}</div>
          <button onClick={onClose} disabled={submitting} style={{
            background: 'none', border: 'none', cursor: submitting ? 'wait' : 'pointer',
            color: colors.dim, fontSize: 18, padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          {clip?.title && (
            <div style={{
              fontFamily: FONTS.serif, fontSize: 16, color: colors.ink,
              marginBottom: 10,
            }}>
              "{clip.title}"
            </div>
          )}
          <div style={{ fontSize: 12, color: colors.body, marginBottom: 16, lineHeight: 1.5 }}>
            Pick how this clip should render. Your settings save to the
            sermon — the next Render now / Render all will pre-fill with
            these.
          </div>

          <DetailToggle
            checked={vertical}
            onChange={setVertical}
            disabled={submitting}
            label="Vertical (9:16)"
            hint="Reframe to portrait for Reels / TikTok / Shorts. Off = 16:9 horizontal."
          />
          <div style={{
            paddingLeft: 22, marginLeft: 6, marginTop: 10,
            borderLeft: `2px solid ${colors.line2}`,
            display: 'grid', gap: 14,
            opacity: vertical ? 1 : 0.4,
            pointerEvents: vertical ? 'auto' : 'none',
            transition: 'opacity 0.15s',
          }}>
            <DetailToggle
              checked={faceTracking}
              onChange={setFaceTracking}
              disabled={submitting}
              label="Follow speaker with AI"
              hint="Face tracking keeps the speaker centered. Off = static center crop."
            />
            <div>
              <div style={{ fontSize: 13, color: colors.ink, fontFamily: FONTS.sans }}>
                Crop lower third
              </div>
              <div style={{ fontSize: 11.5, color: colors.dim, marginTop: 2, marginBottom: 8, lineHeight: 1.45 }}>
                Drop the bottom 30% before reframing if the source has a banner/text overlay.
              </div>
              <DetailSegmented
                value={crop}
                onChange={setCrop}
                disabled={submitting}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'on', label: 'On' },
                  { value: 'off', label: 'Off' },
                ]}
              />
            </div>
          </div>

          <div style={{
            marginTop: 16, paddingTop: 14,
            borderTop: `1px solid ${colors.line}`,
          }}>
            <div style={{ fontSize: 13, color: colors.ink, fontFamily: FONTS.sans, marginBottom: 4 }}>
              Caption template
            </div>
            <div style={{ fontSize: 11.5, color: colors.dim, marginBottom: 8, lineHeight: 1.45 }}>
              All clips burn in karaoke-style captions. Pick the look.
            </div>
            <select
              value={captionTemplate}
              onChange={(e) => setCaptionTemplate(e.target.value)}
              disabled={submitting}
              style={{
                width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                background: '#fff', border: `1px solid ${colors.line2}`,
                borderRadius: 6, fontSize: 13, fontFamily: FONTS.sans,
                color: colors.ink, outline: 'none',
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {CAPTION_TEMPLATES_UI.map(tpl => (
                <option key={tpl.value} value={tpl.value}>{tpl.label}</option>
              ))}
            </select>
            {(() => {
              const sel = CAPTION_TEMPLATES_UI.find(t => t.value === captionTemplate)
              return sel ? (
                <div style={{ fontSize: 11.5, color: colors.dim, marginTop: 6, lineHeight: 1.45 }}>
                  {sel.description}
                </div>
              ) : null
            })()}
            {captionTemplate === 'brand' && (
              <div style={{ marginTop: 10 }}>
                <div style={{
                  fontSize: 10.5, color: colors.muted, textTransform: 'uppercase',
                  letterSpacing: 1.2, marginBottom: 4,
                }}>
                  Brand color (hex)
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    placeholder="#FF5733"
                    disabled={submitting}
                    style={{
                      flex: 1, padding: '8px 10px', boxSizing: 'border-box',
                      background: '#fff', border: `1px solid ${colors.line2}`,
                      borderRadius: 6, fontSize: 13, fontFamily: FONTS.mono,
                      color: colors.ink, outline: 'none',
                    }}
                  />
                  {/^#?[0-9a-fA-F]{6}$/.test((brandColor || '').trim()) && (
                    <div
                      title="Preview of the highlight color"
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        border: `1px solid ${colors.line2}`,
                        background: brandColor.startsWith('#') ? brandColor : `#${brandColor}`,
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{
              fontSize: 12, color: '#8b2929', background: '#fbecec',
              padding: '8px 10px', borderRadius: 6, marginTop: 14,
            }}>{error}</div>
          )}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <Action label="Cancel" icon="x" onClick={onClose} disabled={submitting} />
            <Action
              label={submitting
                ? 'Starting…'
                : (isAll ? `Render ${unrenderedCount}` : 'Render')}
              icon="play"
              primary
              onClick={submit}
              disabled={submitting || (isAll && unrenderedCount === 0)}
            />
          </div>
        </div>
      </div>
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
    // The new `title` field is the editorial headline. Fall back to
    // suggested_hook (or the transcript opener) for clips created
    // before the field existed.
    title: c.title || c.suggested_hook || c.transcript?.slice(0, 80) || 'Untitled clip',
    suggested_hook: c.suggested_hook || '',
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
