/**
 * Deadline-queue dashboard (VE1 spec — Frontend UI - Dashboard.rtf).
 *
 * Layout:
 *   TopBar              dynamic subtitle: "{N} active · {M} need you in next {h}h"
 *   ① UrgencyStrip      4 read-only signal cards (Overdue / Today / Week / On-track)
 *   ② WorkQueue         single sorted list of active jobs, deadline ascending
 *   ③ ByClientCard      per-client active/next-due/on-time
 *      WorkloadCard      next-7-days bar chart
 *
 * Data flow:
 *   /jobs?active=true       → drives ① + ②
 *   /clients/summary        → drives ③ left
 *   /workload?days=7        → drives ③ right
 *
 * Polling: 30s. The backend `now` field in /jobs is the source of truth
 * for "what time is it" so deadline math is computed against server time,
 * not the user's clock (avoids skew on long-lived tabs).
 *
 * The palette here is the spec's cream/charcoal set — distinct from the
 * Brief palette on SermonDetailPage. Two visual identities are
 * intentional: the dashboard is operational, the detail page is
 * editorial. Don't merge them.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Topbar, Btn, Spinner } from '../components/ui.jsx'
import { listJobs, clientsSummary, workload as workloadAPI, updateDeadline, deleteSermon } from '../api.js'

/* ============================================================================
 * Design tokens (spec section 8)
 * ========================================================================== */

const COLORS = {
  bg: '#f6f4ef',
  bgSoft: '#eeece5',
  card: '#ffffff',
  line: '#e7e3d8',
  lineSoft: '#efece3',
  ink: '#18181b',
  ink2: '#3f3f46',
  ink3: '#71717a',
  ink4: '#a1a1aa',
  // status tint pairs — always bg+fg from the same row
  mintBg: '#d8ecd9', mintFg: '#2c6a3a',
  skyBg: '#d6e7f3',  skyFg: '#2d5b85',
  amberBg: '#f4e3c4', amberFg: '#7a5418',
  roseBg: '#f0d6d2',  roseFg: '#8a3f37',
  hoverRow: '#fafaf6',
  // Bar / stripe defaults
  barTrack: '#bcb6a3',
  barEmpty: '#eeece5',
  todayBar: '#18181b',
}

const FONTS = {
  sans: '"Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", "Geist Mono", monospace',
}

// Map dashboard stage → ASS pill style. Mirrors backend spec exactly.
const STAGE_PILL = {
  'awaiting-upload': { bg: COLORS.bgSoft, fg: COLORS.ink3, label: 'Awaiting upload' },
  'queued':          { bg: COLORS.bgSoft, fg: COLORS.ink3, label: 'Queued' },
  'transcribing':    { bg: COLORS.amberBg, fg: COLORS.amberFg, label: 'Transcribing' },
  'review':          { bg: COLORS.skyBg, fg: COLORS.skyFg, label: 'Awaiting your review' },
  'delivered':       { bg: COLORS.mintBg, fg: COLORS.mintFg, label: 'Delivered' },
  'failed':          { bg: COLORS.roseBg, fg: COLORS.roseFg, label: 'Failed' },
}

// How many of the 5 pipeline segments fill for each stage.
const STAGE_SEGMENTS = {
  'awaiting-upload': 0,
  'queued': 1,
  'transcribing': 2,
  'review': 3,
  'delivered': 5,
  'failed': 0,
}

/* ============================================================================
 * Helpers — deadline math, bucketing, formatting
 * ========================================================================== */

function parseISO(s) { return s ? new Date(s) : null }

function hoursUntil(then, now) {
  if (!then || !now) return Infinity
  return (then.getTime() - now.getTime()) / 36e5
}

function isSameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate()
}

function bucketJobs(jobs, now) {
  // Returns the four counts the urgency strip displays.
  const overdue = []
  const today = []
  const week = []
  const later = []
  for (const j of jobs) {
    const dt = parseISO(j.service_datetime)
    if (!dt) { later.push(j); continue }
    const h = hoursUntil(dt, now)
    if (h < 0)                       overdue.push(j)
    else if (isSameCalendarDay(dt, now)) today.push(j)
    else if (h <= 24 * 7)            week.push(j)
    else                             later.push(j)
  }
  return { overdue, today, week, later }
}

function deadlineChip(serviceISO, now) {
  // The leftmost column in a WorkQueueRow. Returns {tone, top, bottom}.
  if (!serviceISO) {
    return { tone: 'later', top: 'No deadline', bottom: '—' }
  }
  const dt = new Date(serviceISO)
  const h = hoursUntil(dt, now)
  const dateLabel = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (h < 0) {
    const dayAgoDelta = Math.ceil(-h / 24)
    if (dayAgoDelta === 1) return { tone: 'urgent', top: 'Past due 1d', bottom: dateLabel }
    return { tone: 'urgent', top: `Past due ${dayAgoDelta}d`, bottom: dateLabel }
  }
  if (h < 24 && isSameCalendarDay(dt, now)) {
    const hrs = Math.max(0, Math.round(h))
    return { tone: 'urgent', top: hrs === 0 ? 'Due now' : `Due in ${hrs}h`, bottom: dateLabel }
  }
  if (h < 24 * 2) {
    return { tone: 'soon', top: 'Due tomorrow', bottom: dateLabel }
  }
  if (h < 24 * 7) {
    return { tone: 'soon', top: `Due ${dt.toLocaleDateString('en-US', { weekday: 'short' })}`, bottom: dateLabel }
  }
  return { tone: 'later', top: `Due ${dt.toLocaleDateString('en-US', { weekday: 'short' })}`, bottom: dateLabel }
}

function chipColors(tone) {
  if (tone === 'urgent') return { bg: COLORS.roseBg, fg: COLORS.roseFg }
  if (tone === 'soon')   return { bg: COLORS.amberBg, fg: COLORS.amberFg }
  return                       { bg: '#eeece5',     fg: COLORS.ink3 }
}

function dynamicSubtitle(jobs, now) {
  if (!jobs?.length) return 'No active jobs · enjoy the quiet.'
  const urgentCount = jobs.filter(j => {
    const dt = parseISO(j.service_datetime)
    return dt && hoursUntil(dt, now) < 24
  }).length
  if (urgentCount === 0) return `${jobs.length} active jobs · nothing urgent.`
  if (urgentCount === 1) return `${jobs.length} active jobs · 1 needs you in the next 24h.`
  return `${jobs.length} active jobs · ${urgentCount} need you in the next 24h.`
}

function formatHM(date) {
  if (!date) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function shortMeta(job) {
  // "{client name} · {service date+time}"
  const dt = parseISO(job.service_datetime)
  const datePart = dt
    ? `${dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatHM(dt)}`
    : 'no deadline'
  return `${job.client?.name || job.client?.id || 'Unknown'} · ${datePart}`
}

/* ============================================================================
 * Data hook — polling /jobs + /clients/summary + /workload
 * ========================================================================== */

function useDashboardData() {
  const [jobs, setJobs] = useState([])
  const [now, setNow] = useState(() => new Date())
  const [clients, setClients] = useState([])
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      // All three calls in parallel — they're independent. If one
      // fails, surface the error but keep the others' data.
      const [jobsRes, clientsRes, workloadRes] = await Promise.allSettled([
        listJobs({ active: true, limit: 200 }),
        clientsSummary(),
        workloadAPI({ days: 7 }),
      ])
      if (jobsRes.status === 'fulfilled') {
        setJobs(jobsRes.value.jobs || [])
        setNow(jobsRes.value.now ? new Date(jobsRes.value.now) : new Date())
        setError(null)
      } else {
        setError(jobsRes.reason?.message || 'Could not load jobs')
      }
      if (clientsRes.status === 'fulfilled') setClients(clientsRes.value.clients || [])
      if (workloadRes.status === 'fulfilled') setDays(workloadRes.value.days || [])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  return { jobs, now, clients, days, loading, error, refreshing, refresh }
}

/* ============================================================================
 * Top-level page
 * ========================================================================== */

export function DashboardPage({ clients: _clientsProp, onNavigate, onSubmit }) {
  const { jobs, now, clients, days, loading, error, refreshing, refresh: refreshDashboard } = useDashboardData()
  // Urgency buckets stay computed against the FULL queue — the counts
  // are meant to be cross-client at-a-glance, not filtered by the
  // selected client. The work queue itself is what filters.
  const buckets = useMemo(() => bucketJobs(jobs, now), [jobs, now])

  // Per-client filter for the work queue. Default "all" shows
  // everything. The dropdown options are derived from jobs (so we
  // only offer clients that have active jobs to filter to), with
  // the client label coming from the job's embedded client metadata.
  const [clientFilter, setClientFilter] = useState('all')
  const clientFilterOptions = useMemo(() => {
    const seen = new Map()
    for (const j of jobs) {
      const c = j.client
      if (!c?.id) continue
      if (!seen.has(c.id)) seen.set(c.id, c.name || c.id)
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [jobs])
  // If the currently-selected client falls off the list (e.g. their
  // last sermon got delivered), snap back to "all" so the queue
  // doesn't render permanently empty.
  useEffect(() => {
    if (clientFilter !== 'all'
        && !clientFilterOptions.some(o => o.id === clientFilter)) {
      setClientFilter('all')
    }
  }, [clientFilter, clientFilterOptions])
  const filteredJobs = useMemo(() => {
    if (clientFilter === 'all') return jobs
    return jobs.filter(j => j.client?.id === clientFilter)
  }, [jobs, clientFilter])

  // Delete a sermon from the dashboard. Hard delete via the existing
  // DELETE /sermon/{id} endpoint — wipes the row, its clips, and the
  // R2 storage prefix. Notion pages stay (archive there manually if
  // needed). Optimistic refresh: we re-fetch the dashboard rather
  // than splicing locally, so urgency buckets, workload chart, and
  // by-client summary all update.
  async function handleDelete(job) {
    const label = job.title || job.id
    const ok = window.confirm(
      `Delete "${label}"?\n\nThis permanently removes the sermon, all its clips, and the source video / audio / rendered clips from storage. Notion pages stay. This cannot be undone.`
    )
    if (!ok) return
    try {
      await deleteSermon(job.id)
      refreshDashboard()
    } catch (e) {
      window.alert(`Failed to delete: ${e.message || e}`)
    }
  }

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      background: COLORS.bg, color: COLORS.ink2,
      fontFamily: FONTS.sans, fontSize: 13,
      fontVariantNumeric: 'tabular-nums',
    }}>
      <Topbar
        title="Dashboard"
        sub={loading ? 'Loading…' : dynamicSubtitle(jobs, now)}
        action={<Btn primary onClick={onSubmit}>+ Submit sermon</Btn>}
      />

      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && (
          <div style={{
            background: COLORS.roseBg, color: COLORS.roseFg, border: `1px solid ${COLORS.line}`,
            padding: '10px 14px', borderRadius: 10, fontSize: 12.5,
          }}>
            Couldn't refresh dashboard: {error}. Will retry in 30 seconds.
          </div>
        )}

        <UrgencyStrip buckets={buckets} now={now} />

        <WorkQueue
          jobs={filteredJobs}
          totalJobCount={jobs.length}
          clientFilter={clientFilter}
          onClientFilterChange={setClientFilter}
          clientFilterOptions={clientFilterOptions}
          now={now}
          loading={loading}
          refreshing={refreshing}
          onOpenSermon={(sermonId, clientId) => onNavigate('sermon-detail', sermonId, clientId)}
          onDeadlineChanged={refreshDashboard}
          onDelete={handleDelete}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          <ByClientCard
            clients={clients}
            onOpenClient={(clientId) => onNavigate('client', null, clientId)}
          />
          <WorkloadCard days={days} now={now} />
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
 * ① UrgencyStrip
 * ========================================================================== */

function UrgencyStrip({ buckets, now }) {
  // Each card: a colored stripe on the left, label, count, subtext.
  const cards = [
    {
      key: 'overdue',
      label: 'Overdue',
      count: buckets.overdue.length,
      stripe: COLORS.roseFg,
      sub: buckets.overdue.length
        ? `${buckets.overdue.length} past deadline`
        : 'Nothing past due',
    },
    {
      key: 'today',
      label: 'Due today',
      count: buckets.today.length,
      stripe: COLORS.roseFg,
      sub: subtextFromJobs(buckets.today, now, 'today'),
    },
    {
      key: 'week',
      label: 'This week',
      count: buckets.week.length,
      stripe: COLORS.amberFg,
      sub: subtextFromJobs(buckets.week, now, 'week'),
    },
    {
      key: 'later',
      label: 'On track',
      count: buckets.later.length,
      stripe: COLORS.mintFg,
      sub: subtextFromJobs(buckets.later, now, 'later'),
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {cards.map(c => {
        const empty = c.count === 0
        return (
          <div
            key={c.key}
            style={{
              background: COLORS.card, border: `1px solid ${COLORS.line}`,
              borderRadius: 12, padding: '14px 16px 14px 22px',
              position: 'relative', overflow: 'hidden',
              opacity: empty ? 0.7 : 1,
            }}
          >
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
              background: c.stripe,
            }} />
            <div style={{
              fontSize: 11, color: COLORS.ink3, textTransform: 'uppercase',
              letterSpacing: 0.6, fontWeight: 500,
            }}>
              {c.label}
            </div>
            <div style={{
              fontFamily: FONTS.sans, fontWeight: 600, fontSize: 32,
              color: COLORS.ink, lineHeight: 1.1, marginTop: 6,
              letterSpacing: '-0.02em',
            }}>
              {c.count}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.ink3, marginTop: 4 }}>
              {c.sub}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function subtextFromJobs(jobs, now, bucket) {
  if (!jobs.length) {
    if (bucket === 'today') return 'Nothing due today'
    if (bucket === 'week')  return 'Quiet week'
    if (bucket === 'later') return 'No upcoming deadlines'
    return ''
  }
  // For today: show hours until soonest deadline
  if (bucket === 'today') {
    const soonest = jobs.reduce((min, j) => {
      const dt = parseISO(j.service_datetime)
      if (!dt) return min
      const h = hoursUntil(dt, now)
      return h < min ? h : min
    }, Infinity)
    const hrs = Math.max(0, Math.round(soonest))
    const name = jobs[0].client?.name || 'Job'
    return `${name} · ${hrs}h`
  }
  // For week + later: show first day name
  if (bucket === 'week' || bucket === 'later') {
    const dt = parseISO(jobs[0].service_datetime)
    if (!dt) return `${jobs.length} jobs`
    const day = dt.toLocaleDateString('en-US', { weekday: 'short' })
    return jobs.length === 1 ? day : `${day} → +${jobs.length - 1} more`
  }
  return `${jobs.length} jobs`
}

/* ============================================================================
 * ② WorkQueue + WorkQueueRow
 * ========================================================================== */

function WorkQueue({
  jobs, totalJobCount, clientFilter, onClientFilterChange, clientFilterOptions,
  now, loading, refreshing, onOpenSermon, onDeadlineChanged, onDelete,
}) {
  const filterActive = clientFilter !== 'all'
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 12,
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${COLORS.lineSoft}`,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <h3 style={{
          margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.ink,
          letterSpacing: '-0.01em',
        }}>
          Work queue
        </h3>
        <span style={{ fontSize: 11.5, color: COLORS.ink3 }}>
          {filterActive
            ? `${jobs.length} of ${totalJobCount} active · filtered`
            : `${jobs.length} active · sorted by deadline`}
        </span>
        <div style={{ flex: 1 }} />
        {refreshing && <Spinner size={14} />}
        <select
          value={clientFilter}
          onChange={e => onClientFilterChange(e.target.value)}
          aria-label="Filter by client"
          style={{
            background: filterActive ? COLORS.bgSoft : COLORS.card,
            color: COLORS.ink2,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 7, padding: '6px 10px',
            fontSize: 12, fontFamily: FONTS.sans, cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="all">All clients</option>
          {clientFilterOptions.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
      </div>

      {loading && jobs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner size={20} /></div>
      ) : jobs.length === 0 ? (
        <EmptyQueue filtered={filterActive} />
      ) : (
        jobs.map((job, i) => (
          <WorkQueueRow
            key={job.id}
            job={job}
            now={now}
            isLast={i === jobs.length - 1}
            onOpen={() => onOpenSermon(job.id, job.client?.id)}
            onDeadlineChanged={onDeadlineChanged}
            onDelete={() => onDelete?.(job)}
          />
        ))
      )}
    </div>
  )
}

function EmptyQueue({ filtered }) {
  return (
    <div style={{
      padding: '40px 24px', textAlign: 'center', color: COLORS.ink3,
      fontSize: 13.5,
    }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: COLORS.ink, marginBottom: 6 }}>
        {filtered ? 'No jobs for this client.' : 'All caught up.'}
      </div>
      <div>
        {filtered ? 'Switch the filter to see other clients.' : 'No active jobs in the queue.'}
      </div>
    </div>
  )
}

function WorkQueueRow({ job, now, isLast, onOpen, onDeadlineChanged, onDelete }) {
  const [hover, setHover] = useState(false)
  const [editingDeadline, setEditingDeadline] = useState(false)
  const chip = deadlineChip(job.service_datetime, now)
  const chipBg = chipColors(chip.tone)
  const stage = job.stage || 'queued'
  const pill = STAGE_PILL[stage] || STAGE_PILL.queued
  const isReview = stage === 'review'

  // The progress visual: continuous bar while transcribing, segmented
  // dots otherwise. The bar's fill color matches deadline urgency
  // so the row reads as a single visual hierarchy: deadline > stage.
  const barColor =
    chip.tone === 'urgent' ? COLORS.roseFg :
    chip.tone === 'soon'   ? COLORS.amberFg :
                             COLORS.mintFg

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 36px 1.4fr 1fr 1fr auto',
        gap: 14, padding: '16px 18px', alignItems: 'center',
        borderBottom: isLast ? 'none' : `1px solid ${COLORS.lineSoft}`,
        cursor: 'pointer',
        background: hover ? COLORS.hoverRow : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {/* 1. Deadline chip — clickable to edit. stopPropagation so the
          chip click doesn't also navigate to detail. */}
      <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setEditingDeadline(true)}
          title="Click to change the deadline"
          style={{
            background: chipBg.bg, color: chipBg.fg, borderRadius: 8,
            padding: '6px 10px', minWidth: 0, border: 'none',
            cursor: 'pointer', width: '100%', textAlign: 'left',
            fontFamily: FONTS.sans,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>
            {chip.top}
          </div>
          <div style={{ fontSize: 10.5, opacity: 0.75, marginTop: 2, fontFamily: FONTS.mono }}>
            {chip.bottom}
          </div>
        </button>
        {editingDeadline && (
          <DeadlinePopover
            sermonId={job.id}
            currentISO={job.service_datetime}
            onClose={() => setEditingDeadline(false)}
            onSaved={() => {
              setEditingDeadline(false)
              onDeadlineChanged?.()
            }}
          />
        )}
      </div>

      {/* 2. Client avatar */}
      <Avatar
        bg={job.client?.avatar_color}
        fg={job.client?.avatar_fg_color}
        monogram={job.client?.monogram}
      />

      {/* 3. Sermon identity */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: COLORS.ink,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          letterSpacing: '-0.005em',
        }}>
          {job.title || 'Untitled sermon'}
        </div>
        <div style={{
          fontSize: 12, color: COLORS.ink3, marginTop: 3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {shortMeta(job)}
        </div>
      </div>

      {/* 4. Stage + detail */}
      <div style={{ minWidth: 0 }}>
        <Pill bg={pill.bg} fg={pill.fg}>{pill.label}</Pill>
        <div style={{
          fontSize: 11.5, color: COLORS.ink3, marginTop: 6, lineHeight: 1.4,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {job.detail_text}
        </div>
      </div>

      {/* 5. Pipeline progress */}
      <div style={{ minWidth: 0 }}>
        {stage === 'transcribing' ? (
          <ProgressBar value={job.stage_progress || 0.1} fill={barColor} />
        ) : (
          <SegmentedPipeline filled={STAGE_SEGMENTS[stage] || 0} fill={barColor} />
        )}
        <div style={{
          fontSize: 10.5, color: COLORS.ink4, textTransform: 'uppercase',
          letterSpacing: 1, marginTop: 6, fontFamily: FONTS.sans,
        }}>
          {stageCaption(stage)}
        </div>
      </div>

      {/* 6. Action — primary Open on review, ghost Details otherwise.
          Hover-revealed Delete sits next to it for quick cleanup. */}
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title="Delete sermon permanently"
            aria-label="Delete sermon"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 7, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: COLORS.ink4,
              opacity: hover ? 1 : 0,
              transition: 'opacity 0.12s, background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = COLORS.ink4 }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M6 4V2.5A.5.5 0 016.5 2h3a.5.5 0 01.5.5V4M5 4l.7 9a1 1 0 001 .9h2.6a1 1 0 001-.9L11 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {isReview ? (
          <button
            onClick={onOpen}
            style={{
              padding: '8px 16px', background: COLORS.ink, color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: FONTS.sans,
            }}
          >
            Open
          </button>
        ) : (
          <button
            onClick={onOpen}
            style={{
              padding: '7px 14px', background: 'transparent', color: COLORS.ink2,
              border: `1px solid ${COLORS.line}`, borderRadius: 8,
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              fontFamily: FONTS.sans,
            }}
          >
            Details
          </button>
        )}
      </div>
    </div>
  )
}

function stageCaption(stage) {
  if (stage === 'awaiting-upload') return 'Awaiting upload'
  if (stage === 'queued') return 'Step 1 of 5'
  if (stage === 'transcribing') return 'Step 2 of 5'
  if (stage === 'review') return 'Step 3 of 5'
  if (stage === 'delivered') return 'Done'
  if (stage === 'failed') return 'Failed'
  return ''
}

/* ============================================================================
 * ③ By-client + Workload (footer pair)
 * ========================================================================== */

function ByClientCard({ clients, onOpenClient }) {
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 12,
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${COLORS.lineSoft}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: COLORS.ink, letterSpacing: '-0.01em' }}>
          By client · this week
        </h3>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: COLORS.ink3 }}>
          {clients.length} {clients.length === 1 ? 'church' : 'churches'}
        </span>
      </div>

      {clients.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: COLORS.ink3, fontSize: 13 }}>
          No clients yet.
        </div>
      ) : (
        clients.map((c, i) => (
          <ByClientRow
            key={c.id}
            client={c}
            isLast={i === clients.length - 1}
            onClick={() => onOpenClient(c.id)}
          />
        ))
      )}
    </div>
  )
}

function ByClientRow({ client, isLast, onClick }) {
  const [hover, setHover] = useState(false)
  const nextDueDate = client.next_due ? new Date(client.next_due) : null
  const nextDueLabel = nextDueDate
    ? nextDueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '—'
  const onTimeLabel = client.on_time_rate == null
    ? '—'
    : `${Math.round(client.on_time_rate * 100)}%`

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1.2fr 1fr 1fr 1fr auto',
        gap: 14, padding: '14px 18px', alignItems: 'center',
        borderBottom: isLast ? 'none' : `1px solid ${COLORS.lineSoft}`,
        cursor: 'pointer',
        background: hover ? COLORS.hoverRow : 'transparent',
      }}
    >
      <Avatar bg={client.avatar_color} fg={client.avatar_fg_color} monogram={client.monogram} />
      <div style={{
        fontSize: 13.5, fontWeight: 500, color: COLORS.ink,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {client.name}
      </div>
      <Metric label="Active" value={String(client.active_count)} />
      <Metric label="Next due" value={nextDueLabel} />
      <Metric label="On-time" value={onTimeLabel} />
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M6 4l4 4-4 4" stroke={COLORS.ink4} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10, color: COLORS.ink4, textTransform: 'uppercase',
        letterSpacing: 0.8, fontWeight: 500,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 600, color: COLORS.ink, marginTop: 2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {value}
      </div>
    </div>
  )
}

function WorkloadCard({ days, now }) {
  const max = Math.max(1, ...days.map(d => d.deliverables))
  const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10)
  // Heaviest day pulled out for the callout
  let heaviest = null
  for (const d of days) {
    if (!heaviest || d.deliverables > heaviest.deliverables) heaviest = d
  }

  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 12,
      padding: '14px 18px',
    }}>
      <div style={{
        fontSize: 11, color: COLORS.ink3, textTransform: 'uppercase',
        letterSpacing: 0.8, fontWeight: 500,
      }}>
        Workload · next 7 days
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${days.length || 7}, 1fr)`, gap: 6,
        marginTop: 14, height: 72, alignItems: 'end',
      }}>
        {days.length === 0
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} style={{ height: 8, background: COLORS.barEmpty, borderRadius: 3 }} />
            ))
          : days.map(d => {
              const isToday = d.date === todayKey
              const pct = d.deliverables / max
              const height = d.deliverables === 0 ? 8 : Math.max(10, pct * 72)
              return (
                <div key={d.date} title={`${d.date}: ${d.deliverables}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%',
                    height,
                    background:
                      d.deliverables === 0 ? COLORS.barEmpty :
                      isToday ? COLORS.todayBar : COLORS.barTrack,
                    borderRadius: 3,
                  }} />
                </div>
              )
            })
        }
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${days.length || 7}, 1fr)`, gap: 6,
        marginTop: 6, fontSize: 10.5, color: COLORS.ink4,
        textAlign: 'center', fontFamily: FONTS.mono, letterSpacing: 0.3,
      }}>
        {days.length === 0
          ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(l => <span key={l}>{l}</span>)
          : days.map(d => {
              const dt = new Date(d.date)
              return <span key={d.date}>{dt.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
            })
        }
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: COLORS.ink3, lineHeight: 1.5 }}>
        {heaviest && heaviest.deliverables > 0 ? (
          <>
            Heaviest day:{' '}
            <strong style={{ color: COLORS.ink, fontWeight: 600 }}>
              {new Date(heaviest.date).toLocaleDateString('en-US', { weekday: 'long' })}
            </strong>{' '}
            with {heaviest.deliverables} {heaviest.deliverables === 1 ? 'deliverable' : 'deliverables'}.
          </>
        ) : (
          'Nothing scheduled in the next 7 days.'
        )}
      </div>
    </div>
  )
}

/* ============================================================================
 * Small primitives
 * ========================================================================== */

function Avatar({ bg, fg, monogram }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      background: bg || '#e7e3d8',
      color: fg || '#3f3f46',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, fontSize: 12, fontFamily: FONTS.sans,
      letterSpacing: 0.3, flexShrink: 0,
    }}>
      {(monogram || '?').slice(0, 2)}
    </div>
  )
}

function Pill({ bg, fg, children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 999,
      background: bg, color: fg, fontSize: 11, fontWeight: 500,
      fontFamily: FONTS.sans, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function ProgressBar({ value, fill }) {
  const pct = Math.max(0, Math.min(1, value || 0))
  return (
    <div style={{
      height: 4, background: COLORS.barEmpty, borderRadius: 2,
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${pct * 100}%`, height: '100%', background: fill,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

function SegmentedPipeline({ filled, fill }) {
  // 5 segments — upload, transcribe, clip, review, deliver
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          height: 4, background: i < filled ? fill : COLORS.barEmpty,
          borderRadius: 2,
        }} />
      ))}
    </div>
  )
}

function DeadlinePopover({ sermonId, currentISO, onClose, onSaved }) {
  // YYYY-MM-DD for the <input type="date">. If we have a stored ISO,
  // peel off the date portion; otherwise default to today.
  const initialDate = useMemo(() => {
    if (currentISO) {
      try { return new Date(currentISO).toISOString().slice(0, 10) } catch {}
    }
    return new Date().toISOString().slice(0, 10)
  }, [currentISO])
  const [date, setDate] = useState(initialDate)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const popoverRef = useRef(null)

  // Click-away + Esc close. Avoids stealing focus from the input.
  useEffect(() => {
    function handleDown(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose()
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  async function save() {
    setError('')
    setSubmitting(true)
    try {
      // 9am local on the chosen date matches the convention in
      // SubmitModal (a workable "morning deliverable" time).
      const iso = date ? `${date}T09:00:00` : null
      await updateDeadline(sermonId, iso)
      onSaved?.()
    } catch (e) {
      setError(e?.message || 'Failed to update')
      setSubmitting(false)
    }
  }

  async function clearDeadline() {
    setError('')
    setSubmitting(true)
    try {
      await updateDeadline(sermonId, null)
      onSaved?.()
    } catch (e) {
      setError(e?.message || 'Failed to clear')
      setSubmitting(false)
    }
  }

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'absolute', top: '100%', left: 0, marginTop: 6,
        zIndex: 50, background: COLORS.card,
        border: `1px solid ${COLORS.line}`, borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        padding: 12, width: 240, fontFamily: FONTS.sans,
      }}
    >
      <div style={{
        fontSize: 10.5, color: COLORS.ink3, textTransform: 'uppercase',
        letterSpacing: 0.8, fontWeight: 500, marginBottom: 6,
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
          border: `1px solid ${COLORS.line}`, borderRadius: 6,
          fontSize: 13, fontFamily: FONTS.sans, color: COLORS.ink,
          outline: 'none',
        }}
      />
      {error && (
        <div style={{
          fontSize: 11.5, color: COLORS.roseFg, marginTop: 6, lineHeight: 1.4,
        }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
        {currentISO && (
          <button
            type="button"
            onClick={clearDeadline}
            disabled={submitting}
            title="Remove the deadline (sermon stays in active queue but sorts last)"
            style={{
              background: 'transparent', color: COLORS.ink3,
              border: 'none', padding: '6px 4px', fontSize: 11.5,
              cursor: submitting ? 'wait' : 'pointer',
              fontFamily: FONTS.sans,
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
            background: 'transparent', color: COLORS.ink2,
            border: `1px solid ${COLORS.line}`, padding: '6px 12px',
            borderRadius: 6, fontSize: 12, fontWeight: 500,
            cursor: submitting ? 'wait' : 'pointer', fontFamily: FONTS.sans,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={submitting}
          style={{
            background: COLORS.ink, color: '#fff', border: 'none',
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
