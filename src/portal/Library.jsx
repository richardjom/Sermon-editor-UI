import React, { useMemo, useState } from 'react'
import { downloadApiFile, transcriptPdfUrl } from '../api.js'
import { PIcon, STATUS_LABEL, clipStatus, fmtDate, fmtTime, hashtags } from './shared.jsx'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'needs', label: 'Needs review' },
  { id: 'approved', label: 'Approved' },
  { id: 'changes', label: 'Being updated' },
]

// How many earlier sermons show before "Show all".
const EARLIER_LIMIT = 5

// Home: the picked sermon (this week's by default) with its clips laid out
// on the message they came from, the clip grid, then earlier sermons.
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

  const firstToReview = clips.find(c => clipStatus(c) === 'needs') || clips[0]
  const minutes = sermon.duration_seconds ? Math.round(sermon.duration_seconds / 60) : null
  const earlier = sermons.filter(s => s.sermon_id !== sermon.sermon_id)

  return (
    <main className="pt-main">
      <section className="pt-hero" aria-labelledby="pt-sermon-title">
        <div className="pt-hero-head">
          <div className="pt-hero-text">
            <p className="pt-hero-date">{fmtDate(sermon) || 'Sermon'}</p>
            <h1 id="pt-sermon-title">{sermon.title || 'Untitled sermon'}</h1>
            <p className="pt-sub">
              {minutes ? `${minutes}-minute message, ` : ''}{clips.length} clip{clips.length !== 1 ? 's' : ''}
            </p>
          </div>
          {clips.length > 0 && (
            <div className="pt-hero-actions">
              <p className="pt-progress-label">
                <strong>{counts.approved} of {counts.all}</strong> approved
              </p>
              <div className="pt-inline">
                <button type="button" className="pt-btn pt-btn-primary pt-btn-lg" onClick={() => onOpenClip(firstToReview.clip_id)}>
                  <PIcon name="play" size={14} /> {counts.needs ? 'Review clips' : 'Watch clips'}
                </button>
                {counts.needs > 0 && (
                  <button type="button" className="pt-btn pt-btn-lg" onClick={approveAll} disabled={approvingAll}>
                    <PIcon name="check" strokeWidth={2.5} /> {approvingAll ? 'Approving…' : `Approve all ${counts.needs}`}
                  </button>
                )}
                {sermon.has_transcript && (
                  <button type="button" className="pt-btn pt-btn-ghost pt-btn-lg" onClick={downloadTranscript}>
                    <PIcon name="doc" /> Transcript
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {clips.length > 0 && <SermonStrip sermon={sermon} counts={counts} onOpenClip={onOpenClip} />}
      </section>

      {clips.length === 0 ? (
        <div className="pt-empty">
          <h2>Clips are on the way</h2>
          <p>This sermon’s clips are still being finished. They’ll show up here when they’re ready.</p>
        </div>
      ) : (
        <section className="pt-section" aria-label="Clips">
          <div className="pt-toolbar">
            <div className="pt-tabs" role="group" aria-label="Filter by review status">
              {TABS.map(t => (
                <button
                  key={t.id} type="button" className="pt-tab"
                  aria-pressed={tab === t.id} onClick={() => setTab(t.id)}
                >
                  {t.label} <span className="pt-tab-count">{counts[t.id]}</span>
                </button>
              ))}
            </div>
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
          </div>

          {shown.length === 0 ? (
            <div className="pt-empty"><p>No clips match. Try another word or switch to All.</p></div>
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
        </section>
      )}

      {earlier.length > 0 && <EarlierSermons sermons={earlier} onPick={onPickSermon} />}

      <footer className="pt-footer"><span>Powered by</span><strong>Sunday Cues</strong></footer>
    </main>
  )
}

// The whole message as one bar, each clip drawn where it falls in it and
// colored by where its review stands. Clicking a clip opens it.
function SermonStrip({ sermon, counts, onOpenClip }) {
  const clips = sermon.clips
  const total = sermon.duration_seconds || Math.max(...clips.map(c => c.end_seconds), 1)
  return (
    <div className="pt-strip-wrap">
      <div className="pt-strip">
        {clips.map(c => {
          const s = clipStatus(c)
          const width = Math.max((c.duration_seconds / total) * 100, 2.4)
          return (
            <button
              key={c.clip_id} type="button" className={`pt-seg seg-${s}`}
              style={{ left: `${Math.min((c.start_seconds / total) * 100, 100 - width)}%`, width: `${width}%` }}
              onClick={() => onOpenClip(c.clip_id)}
              aria-label={`Clip ${c.number}, ${c.title}, starts at ${fmtTime(c.start_seconds)}, ${STATUS_LABEL[s]}`}
              title={`${c.number}. ${c.title}`}
            >
              <span aria-hidden="true">{c.number}</span>
            </button>
          )
        })}
      </div>
      <div className="pt-strip-foot">
        <span className="pt-num">0:00</span>
        <span className="pt-strip-legend">
          {counts.needs > 0 && <span><i className="pt-dot dot-needs" />{counts.needs} need review</span>}
          {counts.approved > 0 && <span><i className="pt-dot dot-approved" />{counts.approved} approved</span>}
          {counts.changes > 0 && <span><i className="pt-dot dot-changes" />{counts.changes} being updated</span>}
        </span>
        <span className="pt-num">{fmtTime(total)}</span>
      </div>
    </div>
  )
}

function EarlierSermons({ sermons, onPick }) {
  const [all, setAll] = useState(false)
  const list = all ? sermons : sermons.slice(0, EARLIER_LIMIT)
  return (
    <section className="pt-section" aria-labelledby="pt-earlier">
      <h2 id="pt-earlier" className="pt-h2">Earlier sermons</h2>
      <div className="pt-sermon-list">
        {list.map(s => (
          <button key={s.sermon_id} type="button" className="pt-sermon-row" onClick={() => onPick(s.sermon_id)}>
            <span className="pt-sermon-date">{fmtDate(s)}</span>
            <span className="pt-sermon-title">{s.title || 'Untitled sermon'}</span>
            <span className="pt-sermon-meta">{sermonSummary(s)}</span>
            <PIcon name="right" />
          </button>
        ))}
      </div>
      {sermons.length > EARLIER_LIMIT && (
        <button type="button" className="pt-btn pt-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(v => !v)}>
          {all ? 'Show fewer' : `Show all ${sermons.length}`}
        </button>
      )}
    </section>
  )
}

function sermonSummary(s) {
  if (!s.delivered) return 'Not delivered yet'
  const n = s.clip_count || 0
  if (!n) return 'Clips on the way'
  const clips = `${n} clip${n !== 1 ? 's' : ''}`
  if (s.approved_count === n) return `${clips}, all approved`
  if (s.changes_count) return `${clips}, ${s.changes_count} being updated`
  return `${clips}, ${s.approved_count} approved`
}

function ClipCard({ clip, busy, onOpen, onReview }) {
  const status = clipStatus(clip)
  const tags = hashtags(clip.caption).slice(0, 3)
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
        <span className="pt-card-meta">Starts at <span className="pt-num">{fmtTime(clip.start_seconds)}</span></span>
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
              Approved, undo
            </button>
          )}
          {status === 'changes' && <span className="pt-status-note">Being updated</span>}
          <a className="pt-icon-btn" href={clip.download_url} download aria-label={`Download clip ${clip.number}`}>
            <PIcon name="download" />
          </a>
        </div>
      </div>
    </article>
  )
}
