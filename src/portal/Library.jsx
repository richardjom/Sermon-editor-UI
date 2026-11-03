import React, { useMemo, useState } from 'react'
import { downloadApiFile, transcriptPdfUrl } from '../api.js'
import { PIcon, STATUS_LABEL, clipStatus, fmtDate, fmtTime, sermonName } from './shared.jsx'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'needs', label: 'Needs review' },
  { id: 'approved', label: 'Approved' },
  { id: 'changes', label: 'Being updated' },
]

// How many other sermons show before "Show all".
const OTHERS_LIMIT = 5
const VIEW_KEY = 'portal-view'

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}

// Home: the picked sermon (this week's by default) with its clips as a grid
// of thumbnails or a list, then the church's other sermons.
export function Library({ sermons, sermon, onPickSermon, onOpenClip, onReview, busyClipId }) {
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState(readView)
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

  function pickView(v) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch {}
  }

  async function approveAll() {
    setApprovingAll(true)
    try {
      for (const c of clips.filter(x => clipStatus(x) === 'needs')) {
        await onReview(c.clip_id, 'approved')
      }
    } catch {
      // onReview already told the user what went wrong.
    } finally {
      setApprovingAll(false)
    }
  }

  function downloadTranscript() {
    downloadApiFile(transcriptPdfUrl(sermon.sermon_id), 'transcript.pdf').catch(e => alert(e.message))
  }

  const name = sermonName(sermon)
  const date = fmtDate(sermon, true)
  const minutes = sermon.duration_seconds ? Math.round(sermon.duration_seconds / 60) : null
  const meta = [
    date !== name ? date : null,
    minutes ? `${minutes}-minute message` : null,
    `${clips.length} clip${clips.length !== 1 ? 's' : ''}`,
  ].filter(Boolean).join(', ')
  const firstToReview = clips.find(c => clipStatus(c) === 'needs') || clips[0]
  const others = sermons.filter(s => s.sermon_id !== sermon.sermon_id)
  const isNewest = sermons[0]?.sermon_id === sermon.sermon_id

  return (
    <main className="pt-main">
      <section className="pt-head" aria-labelledby="pt-sermon-title">
        <div className="pt-head-text">
          <h1 id="pt-sermon-title">{name}</h1>
          <p className="pt-sub">{meta}</p>
          {clips.length > 0 && (
            <div className="pt-progress">
              <div className="pt-progress-track" aria-hidden="true">
                <div style={{ width: `${(counts.approved / counts.all) * 100}%` }} />
              </div>
              <span><strong className="pt-num">{counts.approved} of {counts.all}</strong> approved</span>
            </div>
          )}
        </div>
        {clips.length > 0 && (
          <div className="pt-head-actions">
            <button type="button" className="pt-btn pt-btn-primary" onClick={() => onOpenClip(firstToReview.clip_id)}>
              <PIcon name="play" size={12} /> {counts.needs ? 'Review clips' : 'Watch clips'}
            </button>
            {counts.needs > 0 && (
              <button type="button" className="pt-btn" onClick={approveAll} disabled={approvingAll}>
                {approvingAll ? 'Approving…' : `Approve all ${counts.needs}`}
              </button>
            )}
            {sermon.has_transcript && (
              <button type="button" className="pt-btn pt-btn-ghost" onClick={downloadTranscript}>
                <PIcon name="doc" /> Transcript
              </button>
            )}
          </div>
        )}
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
            <div className="pt-toolbar-right">
              <label className="pt-search">
                <PIcon name="search" />
                <input
                  type="search"
                  aria-label="Search clips"
                  placeholder="Search clips"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </label>
              <div className="pt-viewswitch" role="group" aria-label="Layout">
                <button type="button" aria-pressed={view === 'grid'} aria-label="Grid" title="Grid" onClick={() => pickView('grid')}>
                  <PIcon name="grid" />
                </button>
                <button type="button" aria-pressed={view === 'list'} aria-label="List" title="List" onClick={() => pickView('list')}>
                  <PIcon name="list" />
                </button>
              </div>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="pt-empty"><p>No clips match. Try another word or switch to All.</p></div>
          ) : view === 'grid' ? (
            <div className="pt-sheet">
              {shown.map(c => (
                <SheetItem key={c.clip_id} clip={c} busy={busyClipId === c.clip_id} onOpen={() => onOpenClip(c.clip_id)} onReview={onReview} />
              ))}
            </div>
          ) : (
            <div className="pt-cliplist">
              {shown.map(c => (
                <ListRow key={c.clip_id} clip={c} busy={busyClipId === c.clip_id} onOpen={() => onOpenClip(c.clip_id)} onReview={onReview} />
              ))}
            </div>
          )}
        </section>
      )}

      {others.length > 0 && (
        <OtherSermons title={isNewest ? 'Earlier sermons' : 'Other sermons'} sermons={others} onPick={onPickSermon} />
      )}

      <footer className="pt-footer"><span>Powered by</span><strong>Sunday Cues</strong></footer>
    </main>
  )
}

// A still from inside the clip; #t= skips the black first frame.
function Thumb({ clip }) {
  return <video src={`${clip.video_url}#t=0.8`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" />
}

// Approve / undo in one button: a round check on thumbnails, or labeled in
// the list. Clips being updated have no toggle.
function ApproveToggle({ clip, busy, onReview, labeled = false, className = '' }) {
  const status = clipStatus(clip)
  if (status === 'changes') return null
  const approved = status === 'approved'
  return (
    <button
      type="button" className={`pt-approve ${labeled ? 'pt-approve-labeled' : ''} ${approved ? 'is-on' : ''} ${className}`}
      disabled={busy} aria-pressed={approved}
      aria-label={approved ? `Approved. Undo approval of ${clip.title}` : `Approve ${clip.title}`}
      title={approved ? 'Approved. Click to undo' : 'Approve'}
      onClick={() => onReview(clip.clip_id, approved ? 'none' : 'approved')}
    >
      <PIcon name="check" size={14} strokeWidth={2.75} />
      {labeled && (approved ? 'Approved' : 'Approve')}
    </button>
  )
}

function SheetItem({ clip, busy, onOpen, onReview }) {
  const status = clipStatus(clip)
  return (
    <article className="pt-sheet-item">
      <div className="pt-sheet-thumb">
        <button type="button" className="pt-thumb-open" onClick={onOpen} aria-label={`Watch clip ${clip.number}: ${clip.title}`}>
          <Thumb clip={clip} />
          <span className="pt-pill">{fmtTime(clip.duration_seconds)}</span>
          {status === 'changes' && <span className="pt-badge badge-changes">Being updated</span>}
        </button>
        <ApproveToggle clip={clip} busy={busy} onReview={onReview} className="pt-approve-float" />
      </div>
      <h3><span className="pt-sheet-num">{clip.number}</span>{clip.title}</h3>
    </article>
  )
}

function ListRow({ clip, busy, onOpen, onReview }) {
  const status = clipStatus(clip)
  return (
    <article className="pt-cliprow">
      <button type="button" className="pt-cliprow-thumb" onClick={onOpen} aria-label={`Watch clip ${clip.number}: ${clip.title}`}>
        <Thumb clip={clip} />
      </button>
      <button type="button" className="pt-cliprow-text" onClick={onOpen}>
        <span className="pt-cliprow-title">{clip.number}. {clip.title}</span>
        {clip.hook && clip.hook !== clip.title && <span className="pt-cliprow-quote">“{clip.hook}”</span>}
        <span className="pt-cliprow-meta pt-num">Starts at {fmtTime(clip.start_seconds)}, {fmtTime(clip.duration_seconds)} long</span>
      </button>
      <div className="pt-cliprow-actions">
        {status === 'changes' && <span className="pt-chip chip-changes">{STATUS_LABEL.changes}</span>}
        <ApproveToggle clip={clip} busy={busy} onReview={onReview} labeled />
        <a className="pt-icon-btn" href={clip.download_url} download aria-label={`Download clip ${clip.number}`} title="Download">
          <PIcon name="download" />
        </a>
      </div>
    </article>
  )
}

function OtherSermons({ title, sermons, onPick }) {
  const [all, setAll] = useState(false)
  const list = all ? sermons : sermons.slice(0, OTHERS_LIMIT)
  return (
    <section className="pt-section" aria-labelledby="pt-others">
      <h2 id="pt-others" className="pt-h2">{title}</h2>
      <div className="pt-sermon-list">
        {list.map(s => (
          <button key={s.sermon_id} type="button" className="pt-sermon-row" onClick={() => onPick(s.sermon_id)}>
            <span className="pt-sermon-title">{sermonName(s)}</span>
            {fmtDate(s, true) !== sermonName(s) && <span className="pt-sermon-date">{fmtDate(s)}</span>}
            <span className="pt-sermon-meta">{sermonSummary(s)}</span>
            <PIcon name="right" />
          </button>
        ))}
      </div>
      {sermons.length > OTHERS_LIMIT && (
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
