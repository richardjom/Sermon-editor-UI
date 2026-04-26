import React, { useState } from 'react'
import { Modal, FormGroup, Input, Btn } from './ui.jsx'

export function AddClientModal({ open, onClose, onAdd }) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [error, setError] = useState('')

  function handleNameChange(e) {
    const n = e.target.value
    setName(n)
    setId(n.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))
  }

  function handleAdd() {
    if (!name.trim()) return setError('Please enter a client name.')
    if (!id.trim()) return setError('Please enter a client ID.')
    setError('')
    onAdd(name.trim(), id.trim())
    onClose()
    setName(''); setId('')
  }

  return (
    <Modal
      open={open}
      title="Add a client"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleAdd}>Add client</Btn>
        </>
      }
    >
      <FormGroup label="Church / client name">
        <Input value={name} onChange={handleNameChange} placeholder="e.g. Grace Community Church" />
      </FormGroup>
      <FormGroup label="Client ID (used in the API)">
        <Input
          value={id}
          onChange={e => setId(e.target.value)}
          placeholder="e.g. grace_community"
        />
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
          Lowercase letters, numbers, and underscores only. Auto-filled from name.
        </div>
      </FormGroup>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--red-text)', background: 'var(--red-bg)', padding: '8px 10px', borderRadius: 6 }}>
          {error}
        </div>
      )}
    </Modal>
  )
}
