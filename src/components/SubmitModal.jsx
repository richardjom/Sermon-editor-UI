import React, { useState } from 'react'
import { Modal, FormGroup, Input, Select, Btn } from './ui.jsx'
import { submitSermon, submitSermonVideo } from '../api.js'

export function SubmitModal({ open, onClose, clients, onSubmitted }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [clientId, setClientId] = useState(clients[0]?.id || '')
  const [url, setUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Pipeline + render options (Phase 4)
  const [pipeline, setPipeline] = useState('video') // 'video' | 'audio'
  const [vertical, setVertical] = useState(false)
  const [faceTracking, setFaceTracking] = useState(true)
  // crop_lower_third on the API is tristate: null/omitted=auto, true=on, false=off
  const [cropLowerThird, setCropLowerThird] = useState('auto') // 'auto' | 'on' | 'off'

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
    if (!url.trim()) return setError('Please provide a file URL.')
    if (!clientId) return setError('Please select a client.')
    setError('')
    setLoading(true)
    try {
      let result
      if (pipeline === 'video') {
        const render_options = {
          vertical,
          // Only send vertical-dependent flags if vertical is on
          ...(vertical && { face_tracking: faceTracking }),
          // For crop_lower_third: 'auto' → omit so the backend
          // auto-detects; 'on' → true; 'off' → false.
          ...(vertical && cropLowerThird !== 'auto' && {
            crop_lower_third: cropLowerThird === 'on',
          }),
        }
        result = await submitSermonVideo({
          client_id: clientId, sermon_title: title, sermon_date: date,
          file_url: url, render_options,
        })
      } else {
        result = await submitSermon({
          client_id: clientId, sermon_title: title, sermon_date: date,
          file_url: url,
        })
      }
      onSubmitted(result.sermon_id)
      onClose()
      setTitle(''); setUrl(''); setFileName('')
    } catch (e) {
      setError('Could not submit. Check that the API is reachable.')
    }
    setLoading(false)
  }

  const acceptTypes = pipeline === 'video' ? '.mp4,.mov,.webm' : '.mp3,.m4a,.wav'
  const dropHint = pipeline === 'video' ? 'Drop MP4, MOV, or WebM here' : 'Drop MP3, M4A, or WAV here'
  const urlHint = pipeline === 'video'
    ? 'https://www.dropbox.com/.../sermon.mp4?dl=1'
    : 'https://storage.example.com/sermon.mp3'

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

      <FormGroup label="Pipeline">
        <div style={{ display: 'flex', gap: 16 }}>
          <PipelineRadio
            label="Video"
            sub="MP4 → clips with captions, optionally vertical"
            checked={pipeline === 'video'}
            onChange={() => setPipeline('video')}
          />
          <PipelineRadio
            label="Audio only"
            sub="MP3 → transcript and clip metadata, no rendered video"
            checked={pipeline === 'audio'}
            onChange={() => setPipeline('audio')}
          />
        </div>
      </FormGroup>

      <FormGroup label={pipeline === 'video' ? 'Video file URL' : 'Audio file URL'}>
        <Input value={url} onChange={e => setUrl(e.target.value)} placeholder={urlHint} />
      </FormGroup>

      {pipeline === 'video' && (
        <FormGroup label="Render options">
          <div style={{
            display: 'grid', gap: 8,
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '12px',
            background: 'var(--surface-2)',
          }}>
            <Toggle
              checked={vertical}
              onChange={setVertical}
              label="Vertical (9:16)"
              hint="Reframe each clip to portrait for Reels / TikTok / Shorts."
            />
            <div style={{
              opacity: vertical ? 1 : 0.4,
              pointerEvents: vertical ? 'auto' : 'none',
              paddingLeft: 24, display: 'grid', gap: 8,
              borderLeft: '2px solid var(--border)',
              marginLeft: 4,
            }}>
              <Toggle
                checked={faceTracking}
                onChange={setFaceTracking}
                label="Follow speaker with AI"
                hint="Uses face tracking to keep the speaker centered. Off = static center crop."
              />
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>Crop lower third</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  Drop the bottom 30% before reframing if the source has a banner/text overlay.
                </div>
                <SegmentedRadio
                  value={cropLowerThird}
                  onChange={setCropLowerThird}
                  options={[
                    { value: 'auto', label: 'Auto', hint: 'Detect overlays in the source' },
                    { value: 'on', label: 'On', hint: 'Always crop' },
                    { value: 'off', label: 'Off', hint: 'Never crop' },
                  ]}
                />
              </div>
            </div>
          </div>
        </FormGroup>
      )}

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
        <input id="file-input-modal" type="file" accept={acceptTypes} style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          {fileName || dropHint}
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

function PipelineRadio({ label, sub, checked, onChange }) {
  return (
    <label
      style={{
        flex: 1, display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '10px 12px',
        border: `1px solid ${checked ? 'var(--text)' : 'var(--border)'}`,
        borderRadius: 8, cursor: 'pointer',
        background: checked ? 'var(--surface-2)' : 'transparent',
      }}
    >
      <input type="radio" checked={checked} onChange={onChange} style={{ marginTop: 3 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
      </div>
    </label>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{hint}</div>}
      </div>
    </label>
  )
}

function SegmentedRadio({ value, onChange, options }) {
  return (
    <div
      role="radiogroup"
      style={{
        display: 'inline-flex',
        border: '1px solid var(--border-mid)',
        borderRadius: 8, overflow: 'hidden',
        background: 'var(--surface)',
        marginTop: 4,
      }}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '6px 14px',
              fontSize: 12, fontWeight: 500,
              border: 'none',
              borderLeft: i === 0 ? 'none' : '1px solid var(--border-mid)',
              background: selected ? 'var(--text)' : 'transparent',
              color: selected ? '#fff' : 'var(--text-2)',
              cursor: 'pointer',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
