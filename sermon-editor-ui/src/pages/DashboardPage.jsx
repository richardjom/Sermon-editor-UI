import React, { useState, useEffect } from 'react'
import { Topbar, Card, CardHeader, StatCard, EmptyState, Btn, Spinner } from '../components/ui.jsx'
import { SermonRow } from '../components/SermonRow.jsx'
import { getClientSermons } from '../api.js'

export function DashboardPage({ clients, onNavigate, onSubmit }) {
  const [sermons, setSermons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      let all = []
      for (const c of clients) {
        try {
          const d = await getClientSermons(c.id)
          const list = d.sermons || d || []
          all = all.concat(list.map(s => ({ ...s, _clientName: c.name, _clientId: c.id })))
        } catch (e) {}
      }
      all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setSermons(all)
      setLoading(false)
    }
    load()
  }, [clients])

  const totalClips = sermons.reduce((a, s) => a + (s.clips_found || 0), 0)
  const processing = sermons.filter(s => s.status === 'processing').length
  const recent = sermons.slice(0, 5)

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <Topbar
        title="Dashboard"
        sub="Overview of your sermon pipeline"
        action={<Btn primary onClick={onSubmit}>+ Submit sermon</Btn>}
      />
      <div style={{ padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
          <StatCard label="Total sermons" value={loading ? '—' : sermons.length} sub="all time" />
          <StatCard label="Clips identified" value={loading ? '—' : totalClips} sub="across all sermons" />
          <StatCard label="Active clients" value={clients.length} sub="with sermons" />
          <StatCard label="Processing" value={loading ? '—' : processing} sub="right now" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <Card>
            <CardHeader
              title="Recent sermons"
              action={<Btn small onClick={() => onNavigate('sermons')}>View all</Btn>}
            />
            {loading
              ? <div style={{ padding: '2rem', textAlign: 'center' }}><Spinner /></div>
              : recent.length
                ? recent.map(s => (
                    <SermonRow
                      key={s.sermon_id}
                      sermon={s}
                      onClick={() => onNavigate('sermon-detail', s.sermon_id, s._clientId)}
                    />
                  ))
                : <EmptyState message="No sermons yet" />
            }
          </Card>

          <Card>
            <CardHeader
              title="Clients"
              action={<Btn small onClick={() => onNavigate('add-client')}>+ Add</Btn>}
            />
            {clients.length
              ? clients.map((c, i) => {
                  const count = sermons.filter(s => s._clientId === c.id).length
                  const colors = ['#b5d4f4','#9fe1cb','#fac775','#f4c0d1','#c0dd97','#f0997b']
                  const textColors = ['#0c447c','#0f6e56','#854f0b','#72243e','#3b6d11','#993c1d']
                  const bg = colors[i % colors.length]
                  const tc = textColors[i % textColors.length]
                  const initials = c.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
                  return (
                    <div
                      key={c.id}
                      onClick={() => onNavigate('client', c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 1.25rem', borderBottom: '1px solid var(--border)',
                        cursor: 'pointer', transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: bg, color: tc,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 600, flexShrink: 0,
                      }}>{initials}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{count} sermon{count !== 1 ? 's' : ''}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                  )
                })
              : <EmptyState message="No clients yet. Add one to get started." />
            }
          </Card>
        </div>
      </div>
    </div>
  )
}
