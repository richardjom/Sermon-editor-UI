import React, { useCallback, useEffect, useState } from 'react'
import { getPortalSermon, getPortalSermons, reviewClip } from '../api.js'
import { Library } from './Library.jsx'
import { Studio } from './Studio.jsx'
import { ThemeToggle, usePortalTheme } from './shared.jsx'
import './portal.css'

// The church-facing app. A church member sees their own church; staff pass
// previewClientId to see exactly what that church sees (plus undelivered
// sermons, flagged), with a banner to get back to The Editor.
export function Portal({ previewClientId, onExitPreview, account }) {
  const [theme, toggleTheme] = usePortalTheme()
  const [list, setList] = useState(null)
  const [sermonId, setSermonId] = useState(null)
  const [sermon, setSermon] = useState(null)
  const [clipId, setClipId] = useState(null) // set → Studio, null → Library
  const [error, setError] = useState(null)
  const [busyClipId, setBusyClipId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setList(null)
    setError(null)
    getPortalSermons(previewClientId)
      .then(d => {
        if (cancelled) return
        setList(d)
        // Staff previews also list undelivered sermons; open on what the church sees.
        setSermonId((d.sermons.find(x => x.delivered) || d.sermons[0])?.sermon_id || null)
      })
      .catch(e => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [previewClientId])

  useEffect(() => {
    if (!sermonId) { setSermon(null); return }
    let cancelled = false
    setSermon(null)
    setClipId(null)
    getPortalSermon(sermonId)
      .then(d => !cancelled && setSermon(d))
      .catch(e => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [sermonId])

  // Opening a clip (or going back) starts at the top of the page.
  const view = clipId ? 'studio' : 'library'
  useEffect(() => { window.scrollTo(0, 0) }, [view])

  // Saves a decision and updates the clip in place. Throws so the caller
  // can show the error next to the button that was pressed.
  const onReview = useCallback(async (id, status, note) => {
    setBusyClipId(id)
    try {
      const res = await reviewClip(id, status, note)
      setSermon(s => s && { ...s, clips: s.clips.map(c => (c.clip_id === id ? { ...c, review: res.review } : c)) })
    } catch (e) {
      if (!clipId) alert(e.message)
      throw e
    } finally {
      setBusyClipId(null)
    }
  }, [clipId])

  const client = list?.client
  const monogram = (client?.monogram && client.monogram !== '?')
    ? client.monogram
    : (client?.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

  let content
  if (error) {
    content = <div className="pt-main"><div className="pt-empty"><h2>Something went wrong</h2><p>{error}</p></div></div>
  } else if (!list || (sermonId && !sermon)) {
    content = <div className="pt-center" aria-busy="true"><span className="pt-sub">Loading…</span></div>
  } else if (!list.sermons.length) {
    content = (
      <div className="pt-main">
        <div className="pt-empty">
          <h2>Your first clips are on the way</h2>
          <p>
            {list.in_production
              ? `We’re working on ${list.in_production} sermon${list.in_production > 1 ? 's' : ''} for you. Clips will show up here as soon as they’re ready.`
              : 'Once we finish your next sermon, its clips will show up here.'}
          </p>
        </div>
      </div>
    )
  } else if (clipId && sermon.clips.some(c => c.clip_id === clipId)) {
    content = (
      <Studio
        sermon={sermon} clipId={clipId} onSelect={setClipId} onBack={() => setClipId(null)}
        onReview={onReview} busy={!!busyClipId}
      />
    )
  } else {
    content = (
      <Library
        sermons={list.sermons} sermon={sermon} onPickSermon={setSermonId}
        onOpenClip={setClipId} onReview={onReview} busyClipId={busyClipId}
      />
    )
  }

  return (
    <div className="pt-root" data-theme={theme}>
      {previewClientId && (
        <div className="pt-banner" role="status">
          <span>Previewing {client?.name || 'church'}’s portal{sermon && !sermon.delivered ? ' · this sermon isn’t delivered yet, so the church can’t see it' : ''}</span>
          <button type="button" onClick={onExitPreview}>Back to The Editor</button>
        </div>
      )}
      <header className="pt-header">
        <button type="button" className="pt-brand" onClick={() => setClipId(null)} aria-label="Home">
          <span className="pt-logo">{monogram}</span>
          <span>
            <span className="pt-brand-name">{client?.name || ' '}</span>
            <span className="pt-brand-sub">Clips by Sunday Cues</span>
          </span>
        </button>
        <div className="pt-header-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          {account}
        </div>
      </header>
      {content}
    </div>
  )
}
