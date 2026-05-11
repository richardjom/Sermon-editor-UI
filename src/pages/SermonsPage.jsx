import React, { useState, useEffect } from 'react'
import { Topbar, Card, EmptyState, Btn, Spinner } from '../components/ui.jsx'
import { SermonRow } from '../components/SermonRow.jsx'
import { getClientSermons, deleteSermon } from '../api.js'

export function SermonsPage({ clients, onNavigate, onSubmit }) {
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

  async function handleDelete(sermon) {
    // Optimistic remove — restore if the DELETE fails so the user sees
    // the row come back rather than thinking it worked silently.
    const prev = sermons
    setSermons(sermons.filter(s => s.sermon_id !== sermon.sermon_id))
    try {
      await deleteSermon(sermon.sermon_id)
    } catch (e) {
      setSermons(prev)
      window.alert(`Failed to delete sermon: ${e.message || e}`)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <Topbar
        title="All Sermons"
        sub={loading ? '' : `${sermons.length} sermon${sermons.length !== 1 ? 's' : ''}`}
        action={<Btn primary onClick={onSubmit}>+ Submit sermon</Btn>}
      />
      <div style={{ padding: '1.5rem' }}>
        <Card>
          {loading
            ? <div style={{ padding: '2rem', textAlign: 'center' }}><Spinner /></div>
            : sermons.length
              ? sermons.map(s => (
                  <SermonRow
                    key={s.sermon_id}
                    sermon={s}
                    onClick={() => onNavigate('sermon-detail', s.sermon_id, s._clientId)}
                    onDelete={handleDelete}
                  />
                ))
              : <EmptyState message="No sermons yet. Submit one to get started." />
          }
        </Card>
      </div>
    </div>
  )
}

export function ClientPage({ client, onNavigate, onSubmit }) {
  const [sermons, setSermons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!client) return
    async function load() {
      setLoading(true)
      try {
        const d = await getClientSermons(client.id)
        const list = (d.sermons || d || []).map(s => ({ ...s, _clientName: client.name, _clientId: client.id }))
        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        setSermons(list)
      } catch (e) {}
      setLoading(false)
    }
    load()
  }, [client])

  async function handleDelete(sermon) {
    const prev = sermons
    setSermons(sermons.filter(s => s.sermon_id !== sermon.sermon_id))
    try {
      await deleteSermon(sermon.sermon_id)
    } catch (e) {
      setSermons(prev)
      window.alert(`Failed to delete sermon: ${e.message || e}`)
    }
  }

  if (!client) return null

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <Topbar
        title={client.name}
        sub={loading ? '' : `${sermons.length} sermon${sermons.length !== 1 ? 's' : ''}`}
        action={<Btn primary onClick={onSubmit}>+ Submit sermon</Btn>}
      />
      <div style={{ padding: '1.5rem' }}>
        <Card>
          {loading
            ? <div style={{ padding: '2rem', textAlign: 'center' }}><Spinner /></div>
            : sermons.length
              ? sermons.map(s => (
                  <SermonRow
                    key={s.sermon_id}
                    sermon={s}
                    onClick={() => onNavigate('sermon-detail', s.sermon_id, client.id)}
                    onDelete={handleDelete}
                  />
                ))
              : <EmptyState message="No sermons for this client yet." />
          }
        </Card>
      </div>
    </div>
  )
}
