import React, { useState } from 'react'
import { Modal, FormGroup, Input, Select, Btn } from './ui.jsx'
import { submitSermon } from '../api.js'

export function SubmitModal({ open, onClose, clients, onSubmitted }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [clientId, setClientId] = useState(clients[0]?.id || '')
  const [url, setUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  React.useEffect(() => {
    if (clients.length) setClientId(clients[0].id)
  }, [clients])

  function handleDragOver(e) { e.preventDefault() }
  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) setFileName(file.name)
  }
  function handleFile(e) {
    const file = e.target.files[0]
    if (file) setFileName(file.name)
  }

  async function handleSubmit() {
    if (!title.trim()) return setError('Please enter a sermon title.')
    if (!url.trim()) return setError('Please provide an audio file URL.')
    if (!clientId) return setError('Please select a client.')
    setError('')
    setLoading(true)
    try {
      const result = await submitSermon({ client_id: clientId, sermon_title: title, sermon_date: date, file_url: url })
      onSubmitted(result.sermon_id)
      onClose()
      setTitle(''); setUrl(''); setFileName('')
    } catch (e) {
      setError('Could not submit. Check that the API is reachable.')
    }
    setLoading(false)
  }

  return (
    <Modal
      open={open}
      title="Submit a sermon"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleSubmit} disabled={loading}>
            {loading ? 'Submitting…' : 'Submit sermon'}
          </Btn>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormGroup label="Sermon title">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Faith Over Fear" />
        </FormGroup>
        <FormGroup label="Date">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </FormGroup>
      </div>
      <FormGroup label="Client">
        <Select value={clientId} onChange={e => setClientId(e.target.value)}>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </FormGroup>
      <FormGroup label="Audio file URL">
        <Input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://storage.example.com/sermon.mp3"
        />
      </FormGroup>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '1rem 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>or upload directly</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input-modal').click()}
        style={{
          border: '1px dashed var(--border-mid)',
          borderRadius: 8, padding: '1.5rem',
          textAlign: 'center', cursor: 'pointer',
          background: 'var(--surface-2)',
          transition: 'background 0.12s',
        }}
      >
        <input id="file-input-modal" type="file" accept=".mp3,.m4a,.wav" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          {fileName || 'Drop MP3, M4A, or WAV here'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>or click to browse</div>
      </div>
      {fileName && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
          Direct upload not yet supported by the API. Add a hosted URL above to submit.
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red-text)', background: 'var(--red-bg)', padding: '8px 10px', borderRadius: 6 }}>
          {error}
        </div>
      )}
    </Modal>
  )
}
