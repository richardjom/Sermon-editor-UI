import React, { useEffect, useState } from 'react'
import { PIcon, STATUS_LABEL, captionWithoutTags, clipStatus, fmtTime, hashtags } from './shared.jsx'

// One clip at a time: list on the left, player in the middle, caption +
// download + review on the right, and where each clip sits in the sermon.
export function Studio({ sermon, clipId, onSelect, onBack, onReview, busy }) {
  const clips = sermon.clips
  const index = Math.max(0, clips.findIndex(c => c.clip_id === clipId))
  const clip = clips[index]
  const status = clipStatus(clip)
  const total = sermon.duration_seconds || Math.max(...clips.map(c => c.end_seconds), 1)

  const [requesting, setRequesting] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [landscape, setLandscape] = useState(false)

  // Fresh form for each clip.
  useEffect(() => {
    setRequesting(false)
    setNote('')
    setError(null)
    setCopied(false)
  }, [clipId])

  const go = i => onSelect(clips[Math.min(Math.max(i, 0), clips.length - 1)].clip_id)

  async function submit(nextStatus, nextNote) {
    setError(null)
    try {
      await onReview(clip.clip_id, nextStatus, nextNote)
      return true
    } catch (e) {
      setError(e.message || 'Something went wrong. Try again.')
      return false
    }
  }

  async function approveAndNext() {
    if (!(await submit('approved'))) return
    // Jump to the next clip still waiting on a decision, if any.
    const after = [...clips.slice(index + 1), ...clips.slice(0, index)]
    const next = after.find(c => clipStatus(c) === 'needs')
    if (next) onSelect(next.clip_id)
  }

  async function sendRequest(e) {
    e.preventDefault()
    if (!note.trim()) {
      setError('Tell us what to change.')
      return
    }
    if (await submit('changes', note.trim())) setRequesting(false)
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(clip.caption || '')
      setCopied(true)
    } catch {
      setError('Could not copy. Select the caption text and copy it instead.')
    }
  }

  const tags = hashtags(clip.caption)
  const body = captionWithoutTags(clip.caption)

  return (
    <div className="pt-studio">
      <div>
        <button type="button" className="pt-btn pt-btn-ghost" onClick={onBack}>
          <PIcon name="left" /> All clips
        </button>
      </div>

      <div className="pt-studio-cols">
        <section className="pt-panel pt-col-list" aria-label="Clips">
          <div className="pt-panel-head"><h2>Clips</h2><span className="pt-sub" style={{ margin: 0 }}>{clips.length}</span></div>
          <div className="pt-list">
            {clips.map(c => {
              const s = clipStatus(c)
              return (
                <button
                  key={c.clip_id} type="button" className="pt-row"
                  aria-current={c.clip_id === clip.clip_id}
                  onClick={() => onSelect(c.clip_id)}
                >
                  <span className="pt-row-num">{c.number}</span>
                  <span className="pt-row-text">
                    <span className="pt-row-title">{c.title}</span>
                    <span className="pt-row-sub">Starts {fmtTime(c.start_seconds)} · {fmtTime(c.duration_seconds)}</span>
                  </span>
                  <span className={`pt-dot dot-${s}`} role="img" aria-label={STATUS_LABEL[s]} />
                </button>
              )
            })}
          </div>
          <div className="pt-legend">
            <span><span className="pt-dot dot-needs" />Needs review</span>
            <span><span className="pt-dot dot-approved" />Approved</span>
            <span><span className="pt-dot dot-changes" />Being updated</span>
          </div>
        </section>

        <section className="pt-col-preview" aria-label="Preview">
          <div className="pt-player">
            <video
              key={clip.clip_id} src={clip.video_url} controls playsInline preload="metadata"
              className={landscape ? 'is-landscape' : ''}
              onLoadedMetadata={e => setLandscape(e.currentTarget.videoWidth > e.currentTarget.videoHeight)}
            />
          </div>
          <h1 className="pt-clip-title">{clip.title}</h1>
          <div className="pt-player-nav">
            <button type="button" className="pt-icon-btn" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous clip">
              <PIcon name="left" size={18} />
            </button>
            <span className="pt-label" style={{ color: 'var(--pt-soft)' }}>Clip {index + 1} of {clips.length}</span>
            <button type="button" className="pt-icon-btn" onClick={() => go(index + 1)} disabled={index === clips.length - 1} aria-label="Next clip">
              <PIcon name="right" size={18} />
            </button>
          </div>
        </section>

        <aside className="pt-col-side">
          <section className="pt-panel">
            <h2>Your review</h2>
            {error && <p className="pt-msg pt-msg-error" role="alert">{error}</p>}
            {status === 'needs' && !requesting && (
              <div className="pt-stack">
                <button type="button" className="pt-btn pt-btn-primary pt-btn-lg" onClick={approveAndNext} disabled={busy}>
                  <PIcon name="check" size={18} strokeWidth={2.5} /> Approve &amp; next
                </button>
                <button type="button" className="pt-btn pt-btn-lg" onClick={() => setRequesting(true)} disabled={busy}>
                  Request a change
                </button>
              </div>
            )}
            {requesting && (
              <form className="pt-stack" onSubmit={sendRequest}>
                <label className="pt-label" htmlFor="pt-change-note">What should we change?</label>
                <textarea
                  id="pt-change-note" className="pt-textarea" autoFocus maxLength={2000}
                  placeholder="e.g. Start two seconds later, or fix the spelling of a name in the captions"
                  value={note} onChange={e => setNote(e.target.value)}
                />
                <div className="pt-inline">
                  <button type="submit" className="pt-btn pt-btn-primary" disabled={busy}>Send to Sunday Cues</button>
                  <button type="button" className="pt-btn pt-btn-ghost" onClick={() => setRequesting(false)}>Cancel</button>
                </div>
              </form>
            )}
            {status === 'approved' && (
              <div className="pt-inline" style={{ justifyContent: 'space-between' }}>
                <p className="pt-msg pt-msg-ok" style={{ flex: 1 }}>Approved · ready to post</p>
                <button type="button" className="pt-btn pt-btn-ghost" onClick={() => submit('none')} disabled={busy}>Undo</button>
              </div>
            )}
            {status === 'changes' && !requesting && (
              <div className="pt-stack">
                <p className="pt-msg pt-msg-info">
                  We’re updating this clip and will let you know when it’s ready.
                  {clip.review?.note && <><br />Your note: “{clip.review.note}”</>}
                </p>
                <div className="pt-inline">
                  <button type="button" className="pt-btn" onClick={() => { setNote(clip.review?.note || ''); setRequesting(true) }}>Edit request</button>
                  <button type="button" className="pt-btn pt-btn-ghost" onClick={() => submit('none')} disabled={busy}>Withdraw</button>
                </div>
              </div>
            )}
          </section>

          <section className="pt-panel">
            <div className="pt-panel-head">
              <h2>Post caption</h2>
              {clip.caption && (
                <button type="button" className="pt-btn" style={{ height: 34 }} onClick={copyCaption}>
                  <PIcon name="copy" size={14} /> {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            <p className="pt-caption">{body || 'No caption for this clip.'}</p>
            {tags.length > 0 && <p className="pt-hashtags">{tags.join(' ')}</p>}
          </section>

          <section className="pt-panel">
            <h2>Download</h2>
            <a className="pt-btn pt-btn-lg" href={clip.download_url} download>
              <PIcon name="download" /> Download this clip
            </a>
            <p className="pt-sub" style={{ margin: 0 }}>Need another format, or captions changed? Use “Request a change”.</p>
          </section>
        </aside>
      </div>

      <section className="pt-panel" aria-label="Sermon timeline">
        <div className="pt-panel-head">
          <h2>Where each clip comes from</h2>
          <span className="pt-mono" style={{ fontSize: 13, color: 'var(--pt-soft)' }}>
            {fmtTime(clip.start_seconds)} <span style={{ color: 'var(--pt-muted)' }}>/ {fmtTime(total)}</span>
          </span>
        </div>
        <div className="pt-ticks pt-mono">
          {[0, 0.25, 0.5, 0.75, 1].map(f => <span key={f}>{fmtTime(total * f)}</span>)}
        </div>
        <div className="pt-timeline">
          {clips.map(c => (
            <button
              key={c.clip_id} type="button" className="pt-marker"
              aria-current={c.clip_id === clip.clip_id}
              aria-label={`Clip ${c.number}: ${c.title}`}
              title={`${c.number}. ${c.title}`}
              onClick={() => onSelect(c.clip_id)}
              style={{
                left: `${(c.start_seconds / total) * 100}%`,
                width: `${Math.max((c.duration_seconds / total) * 100, 1.2)}%`,
                background: `var(--pt-${clipStatus(c)})`,
              }}
            />
          ))}
          <span className="pt-playhead" style={{ left: `${(clip.start_seconds / total) * 100}%` }} />
        </div>
      </section>
    </div>
  )
}
