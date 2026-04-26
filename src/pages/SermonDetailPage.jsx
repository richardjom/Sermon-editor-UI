import React, { useState, useEffect, useRef } from 'react'
import { Badge, Btn, Spinner, EmptyState } from '../components/ui.jsx'
import { getSermon, reprocessSermon } from '../api.js'

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
      if (s.status === 'processing') {
        startPolling()
      } else {
        stopPolling()
      }
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

  const date = sermon?.sermon_date
    ? new Date(sermon.sermon_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '1rem 1.5rem',
        display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-2)', fontSize: 13, padding: '4px 8px',
            borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          ← back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{sermon?.sermon_title || sermonId}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>
            {[sermon?._clientName, date].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sermon && <Badge status={sermon.status} />}
          {sermon?.status === 'completed' && (
            <Btn small onClick={handleReprocess}>Reprocess</Btn>
          )}
        </div>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem' }}><Spinner size={24} /></div>
        )}

        {!loading && sermon?.status === 'processing' && (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <Spinner size={24} />
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: '1rem' }}>
              Processing sermon… checking back automatically
            </p>
            <div style={{ maxWidth: 300, margin: '1rem auto 0', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--text)', borderRadius: 2, width: `${progress}%`, transition: 'width 1s ease' }} />
            </div>
          </div>
        )}

        {!loading && sermon?.status === 'failed' && (
          <EmptyState message="Processing failed. You can try reprocessing this sermon." />
        )}

        {!loading && sermon?.status === 'completed' && (() => {
          const clips = sermon.clips || []
          if (!clips.length) return <EmptyState message="No clips were identified for this sermon." />
          return (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: '1.25rem' }}>
                {clips.length} clip{clips.length !== 1 ? 's' : ''} identified
              </p>
              {clips.map((clip, i) => (
                <ClipCard key={clip.clip_id || i} clip={clip} />
              ))}
            </>
          )
        })()}
      </div>
    </div>
  )
}

function ClipCard({ clip }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      marginBottom: 12, overflow: 'hidden',
      background: 'var(--surface)',
    }}>
      <div style={{
        padding: '10px 1rem', background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
          {clip.start_timestamp} → {clip.end_timestamp}
        </span>
        <span style={{ flex: 1 }} />
        <Badge status={clip.strength?.toLowerCase()} />
      </div>
      <div style={{ padding: '1rem' }}>
        {clip.transcript && (
          <p style={{
            fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65,
            fontStyle: 'italic', marginBottom: 12,
            paddingLeft: 12, borderLeft: '3px solid var(--border-mid)',
          }}>
            "{clip.transcript}"
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Detail label="Why it works" value={clip.why_it_works} />
          <Detail label="Suggested hook" value={clip.suggested_hook} />
          <div style={{ gridColumn: '1 / -1' }}>
            <Detail label="Caption" value={clip.suggested_caption} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>{value || '—'}</div>
    </div>
  )
}
