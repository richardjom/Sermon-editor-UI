import React, { useMemo, useState } from 'react'
import { downloadApiFile, transcriptPdfUrl } from '../api.js'
import { PIcon, STATUS_LABEL, clipStatus, fmtDate, fmtTime, hashtags } from './shared.jsx'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'needs', label: 'Needs review' },
  { id: 'approved', label: 'Approved' },
  { id: 'changes', label: 'Being updated' },
]

// Home: this week's (or the picked) sermon's clips as a library grid.
export function Library({ sermons, sermon, onPickSermon, onOpenClip, onReview, busyClipId }) {
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [approvingAll, setApprovingAll] = useState(false)

  const clips = sermon.clips
  const counts = useMemo(() => {
    const c = { all: clips.length, needs: 0, approved: 0, changes: 0 }
    clips.forEach(x => { c[clipStatus(x)]++ })
    return c
  }, [clips])

  const shown = clips.filter(c => {
    if (tab !== 'all' && clipStatus(c) !== tab) return false
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return [c.title, c.hook, c.caption].some(t => (t || '').toLowerCase().includes(q))
  })

  async function approveAll() {
    setApprovingAll(true)
    try {
      for (const c of clips.filter(x => clipStatus(x) === 'needs')) {
        await onReview(c.clip_id, 'approved')
      }
    } finally {
      setApprovingAll(false)
    }
  }

  function downloadTranscript() {
    downloadApiFile(transcriptPdfUrl(sermon.sermon_id), 'transcript.pdf').catch(e => alert(e.message))
  }

  const meta = [fmtDate(sermon), sermon.duration_seconds ? `${fmtTime(sermon.duration_seconds)} message` : null]
    .filter(Boolean).join(' · ')

  return (
    <main className="pt-main">
      <div className="pt-title-row">
        <div>
          <div className="pt-title">
            <h1>{sermon.title || 'Untitled sermon'}</h1>
            <span className="pt-chip-accent">{clips.length} clip{clips.length !== 1 ? 's' : ''}</span>
          </div>
          {meta && <p className="pt-sub">{meta}</p>}
        </div>
        <div className="pt-row-actions">
          {sermons.length > 1 && (
            <select
              className="pt-select"
              aria-label="Choose a sermon"
              value={sermon.sermon_id}
              onChange={e => onPickSermon(e.target.value)}
            >
              {sermons.map(s => (
                <option key={s.sermon_id} value={s.sermon_id}>
                  {fmtDate(s)} · {s.title || 'Untitled'}{s.delivered ? '' : ' (not delivered)'}
                </option>
              ))}
            </select>
          )}
          {sermon.has_transcript && (
            <button type="button" className="pt-btn" onClick={downloadTranscript}>
              <PIcon name="doc" /> Transcript
            </button>
          )}
          {counts.needs > 0 && (
            <button type="button" className="pt-btn pt-btn-accent-outline" onClick={approveAll} disabled={approvingAll}>
              <PIcon name="check" strokeWidth={2.5} /> {approvingAll ? 'Approving…' : `Approve all (${counts.needs})`}
            </button>
          )}
        </div>
      </div>

      <div className="pt-stats">
        <Stat tone="accent" icon="clips" label="Clips ready" value={counts.all} />
        <Stat tone="warn" icon="clock" label="Needs your review" value={counts.needs} />
        <Stat tone="ok" icon="check" label="Approved" value={counts.approved} />
        <Stat tone="info" icon="edit" label="Being updated" value={counts.changes} />
      </div>

      {clips.length === 0 ? (
        <div className="pt-empty">
          <h2>Clips are on the way</h2>
          <p>This sermon’s clips are still being finished. We’ll have them here soon.</p>
        </div>
      ) : (
        <>
          <div className="pt-toolbar">
            <label className="pt-search">
              <PIcon name="search" />
              <input
                type="search"
                aria-label="Search clips"
                placeholder="Search by phrase or topic"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>
            <div className="pt-tabs" role="group" aria-label="Filter by review status">
              {TABS.map(t => (
                <button
                  key={t.id} type="button" className="pt-tab"
                  aria-pressed={tab === t.id} onClick={() => setTab(t.id)}
                >
                  {t.label} ({counts[t.id]})
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="pt-empty"><p>No clips match.</p></div>
          ) : (
            <div className="pt-grid">
              {shown.map(c => (
                <ClipCard
                  key={c.clip_id}
                  clip={c}
                  busy={busyClipId === c.clip_id}
                  onOpen={() => onOpenClip(c.clip_id)}
                  onReview={onReview}
                />
              ))}
            </div>
          )}
        </>
      )}

      <footer className="pt-footer"><span>Powered by</span><strong>Sunday Cues</strong></footer>
    </main>
  )
}

function Stat({ tone, icon, label, value }) {
  return (
    <div className="pt-stat">
      <span className={`pt-stat-icon tone-${tone}`}><PIcon name={icon} size={22} /></span>
      <span>
        <span className="pt-stat-label">{label}</span>
        <span className="pt-stat-value">{value}</span>
      </span>
    </div>
  )
}

function ClipCard({ clip, busy, onOpen, onReview }) {
  const status = clipStatus(clip)
  const tags = hashtags(clip.caption).slice(0, 3)
  const num = String(clip.number).padStart(2, '0')
  return (
    <article className="pt-card">
      <button type="button" className="pt-tile" onClick={onOpen} aria-label={`Watch clip ${clip.number}: ${clip.title}`}>
        {/* #t= shows a frame from inside the clip instead of a black first frame. */}
        <video src={`${clip.video_url}#t=0.8`} preload="metadata" muted playsInline />
        <span className="pt-pill" style={{ top: 12, left: 12 }}>{fmtTime(clip.duration_seconds)}</span>
        <span className={`pt-badge badge-${status}`}>{STATUS_LABEL[status]}</span>
        <span className="pt-tile-play"><PIcon name="play" size={22} /></span>
      </button>
      <div className="pt-card-body">
        <span className="pt-card-meta">
          Clip {num} · <span className="pt-mono">{fmtTime(clip.start_seconds)} – {fmtTime(clip.end_seconds)}</span>
        </span>
        <h3>{clip.title}</h3>
        {clip.hook && clip.hook !== clip.title && <p className="pt-quote">“{clip.hook}”</p>}
        {tags.length > 0 && (
          <div className="pt-tags">{tags.map(t => <span key={t} className="pt-tag">{t}</span>)}</div>
        )}
        <div className="pt-card-actions">
          {status === 'needs' && (
            <button type="button" className="pt-btn pt-btn-primary" disabled={busy} onClick={() => onReview(clip.clip_id, 'approved')}>
              <PIcon name="check" strokeWidth={2.5} /> Approve
            </button>
          )}
          {status === 'approved' && (
            <button type="button" className="pt-btn pt-btn-ok" disabled={busy} onClick={() => onReview(clip.clip_id, 'none')}>
              Approved · Undo
            </button>
          )}
          {status === 'changes' && <span className="pt-status-note">Being updated</span>}
          <button type="button" className="pt-icon-btn" onClick={onOpen} aria-label="Watch and review">
            <PIcon name="play" size={14} />
          </button>
          <a className="pt-icon-btn" href={clip.download_url} download aria-label="Download clip">
            <PIcon name="download" />
          </a>
        </div>
      </div>
    </article>
  )
}
