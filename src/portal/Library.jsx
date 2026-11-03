import React, { useMemo, useState } from 'react'
import { downloadApiFile, transcriptPdfUrl } from '../api.js'
import { PIcon, captionWithoutTags, clipStatus, fmtDate, fmtTime, sermonName } from './shared.jsx'

// How many other sermons show before "Show all".
const OTHERS_LIMIT = 5

// Shown on the picture once the church has decided; undecided clips stay clean.
const BADGE = {
  approved: 'Approved',
  changes: 'Being updated',
}

// Home: the picked sermon (this week's by default), its clips as cards with
// the review actions right on them, the rest of the package, then the
// church's other sermons.
export function Library({ sermons, sermon, onPickSermon, onOpenClip, onReview, busyClipId }) {
  const [approvingAll, setApprovingAll] = useState(false)

  const clips = sermon.clips
  const counts = useMemo(() => {
    const c = { all: clips.length, needs: 0, approved: 0, changes: 0 }
    clips.forEach(x => { c[clipStatus(x)]++ })
    return c
  }, [clips])

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

  // Every clip's post copy in one text file, ready to paste.
  function downloadCaptions() {
    const text = clips
      .filter(c => c.caption)
      .map(c => `${c.number}. ${c.title}\n\n${c.caption}`)
      .join('\n\n---\n\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${sermonName(sermon)} captions.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const name = sermonName(sermon)
  const date = fmtDate(sermon, true)
  const isNewest = sermons[0]?.sermon_id === sermon.sermon_id
  const eyebrow = [isNewest ? 'This week' : null, date !== name ? date : null].filter(Boolean).join(', ')
  const minutes = sermon.duration_seconds ? Math.round(sermon.duration_seconds / 60) : null
  const meta = [minutes ? `${minutes}-minute message` : null, `${clips.length} clip${clips.length !== 1 ? 's' : ''} ready`]
    .filter(Boolean).join(', ')
  const firstToReview = clips.find(c => clipStatus(c) === 'needs')
  const hasCaptions = clips.some(c => c.caption)
  const others = sermons.filter(s => s.sermon_id !== sermon.sermon_id)

  return (
    <main className="pt-main">
      <section className="pt-stage" aria-labelledby="pt-sermon-title">
        {/* The sermon's own footage, blurred, is the backdrop. */}
        {clips[0] && (
          <video className="pt-stage-backdrop" src={`${clips[0].video_url}#t=2`} preload="metadata" muted playsInline aria-hidden="true" tabIndex={-1} />
        )}
        <div className="pt-stage-body">
          <div className="pt-stage-text">
            {eyebrow && <p className="pt-stage-eyebrow">{eyebrow}</p>}
            <h1 id="pt-sermon-title">{name}</h1>
            <p className="pt-stage-meta">{meta}</p>
          </div>
          {clips.length > 0 && (
            <div className="pt-stage-review">
              <div className="pt-stage-count">
                <strong className="pt-num">{counts.approved} of {counts.all} approved</strong>
                <span>{counts.needs ? `${counts.needs} need${counts.needs === 1 ? 's' : ''} your review` : 'All set'}</span>
              </div>
              <div className="pt-progress-track" aria-hidden="true">
                <div style={{ width: `${(counts.approved / counts.all) * 100}%` }} />
              </div>
              <div className="pt-stage-actions">
                {firstToReview ? (
                  <>
                    <button type="button" className="pt-btn pt-btn-lg pt-btn-light" onClick={approveAll} disabled={approvingAll}>
                      <PIcon name="check" strokeWidth={2.5} /> {approvingAll ? 'Approving…' : 'Approve all remaining'}
                    </button>
                    <button type="button" className="pt-btn pt-btn-lg pt-btn-glass" onClick={() => onOpenClip(firstToReview.clip_id)}>
                      <PIcon name="play" size={12} /> Review one by one
                    </button>
                  </>
                ) : (
                  <button type="button" className="pt-btn pt-btn-lg pt-btn-glass" onClick={() => onOpenClip(clips[0].clip_id)}>
                    <PIcon name="play" size={12} /> Watch clips
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {clips.length > 0 && (
          <div className="pt-stage-fan" aria-hidden="true">
            {clips.slice(0, 3).map(c => (
              <video key={c.clip_id} src={`${c.video_url}#t=2`} preload="metadata" muted playsInline tabIndex={-1} />
            ))}
          </div>
        )}
      </section>

      {clips.length === 0 ? (
        <div className="pt-empty">
          <h2>Clips are on the way</h2>
          <p>This sermon’s clips are still being finished. They’ll show up here when they’re ready.</p>
        </div>
      ) : (
        <section className="pt-section" aria-labelledby="pt-clips">
          <div className="pt-section-head">
            <h2 id="pt-clips" className="pt-h2">Your clips</h2>
            <p className="pt-sub">Open a clip to watch it, copy its caption, or ask for a change.</p>
          </div>
          <div className="pt-cards">
            {clips.map(c => (
              <ClipCard
                key={c.clip_id} clip={c} busy={busyClipId === c.clip_id}
                onOpen={() => onOpenClip(c.clip_id)}
                onRequest={() => onOpenClip(c.clip_id, { request: true })}
                onReview={onReview}
              />
            ))}
          </div>
        </section>
      )}

      {(sermon.has_transcript || hasCaptions) && (
        <section className="pt-section" aria-labelledby="pt-package">
          <h2 id="pt-package" className="pt-h2">Also in this package</h2>
          <div className="pt-extras">
            {sermon.has_transcript && (
              <button type="button" className="pt-extra" onClick={downloadTranscript}>
                <span className="pt-extra-icon"><PIcon name="doc" size={20} /></span>
                <span>
                  <span className="pt-extra-title">Sermon transcript</span>
                  <span className="pt-extra-sub">PDF of the full message, word for word</span>
                </span>
              </button>
            )}
            {hasCaptions && (
              <button type="button" className="pt-extra" onClick={downloadCaptions}>
                <span className="pt-extra-icon"><PIcon name="copy" size={20} /></span>
                <span>
                  <span className="pt-extra-title">Captions and hashtags</span>
                  <span className="pt-extra-sub">Post copy for every clip, ready to paste</span>
                </span>
              </button>
            )}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <OtherSermons title={isNewest ? 'Earlier sermons' : 'Other sermons'} sermons={others} onPick={onPickSermon} />
      )}

      <footer className="pt-footer"><span>Powered by</span><strong>Sunday Cues</strong></footer>
    </main>
  )
}

function ClipCard({ clip, busy, onOpen, onRequest, onReview }) {
  const status = clipStatus(clip)
  return (
    <article className="pt-card">
      <button type="button" className="pt-tile" onClick={onOpen} aria-label={`Watch clip ${clip.number}: ${clip.title}`}>
        {/* #t= shows a frame from inside the clip instead of a black first frame. */}
        <video src={`${clip.video_url}#t=2`} preload="metadata" muted playsInline tabIndex={-1} />
        <span className="pt-pill">{fmtTime(clip.duration_seconds)}</span>
        <span className="pt-tile-play"><PIcon name="play" size={20} /></span>
        {status !== 'needs' && (
          <span className={`pt-tile-status status-${status}`}>
            {status === 'approved' && <PIcon name="check" size={12} strokeWidth={3} />}
            {BADGE[status]}
          </span>
        )}
      </button>
      <div className="pt-card-body">
        <div className="pt-card-text">
          <h3>{clip.title}</h3>
          {clip.caption && <p className="pt-card-caption">{captionWithoutTags(clip.caption)}</p>}
        </div>
        {status === 'needs' && (
          <div className="pt-card-actions">
            <button type="button" className="pt-btn pt-btn-primary" disabled={busy} onClick={() => onReview(clip.clip_id, 'approved')}>
              <PIcon name="check" strokeWidth={2.5} /> Approve
            </button>
            <button type="button" className="pt-btn pt-btn-quiet" onClick={onRequest}>Request change</button>
          </div>
        )}
        {status === 'approved' && (
          <div className="pt-card-actions">
            <a className="pt-btn" href={clip.download_url} download>
              <PIcon name="download" /> Download
            </a>
            <button type="button" className="pt-btn pt-btn-ghost pt-btn-undo" disabled={busy} onClick={() => onReview(clip.clip_id, 'none')}>
              Undo
            </button>
          </div>
        )}
        {status === 'changes' && (
          <p className="pt-card-note">We’re updating this clip. The new version will show up here.</p>
        )}
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
