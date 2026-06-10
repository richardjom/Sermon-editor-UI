import React, { useState, useRef } from 'react'
import { Modal, FormGroup, Input, Select, Btn } from './ui.jsx'
import { submitSermon, submitSermonVideo, presignUpload, uploadFileToR2 } from '../api.js'

// Soft client-side size cap. Anything larger is almost certainly a
// mistake (wrong file, raw camera capture) and would take ages on a
// residential connection — better to bounce it before the upload
// starts than discover it 40 minutes in.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB

function humanBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// Render options used to live on this modal, but with deferred-render
// as the default they aren't consumed at submit time — they sit on
// the sermon row and only get read when the user clicks Render now /
// Render all / Trim later. Editing them at submit forced the user to
// commit before seeing the clips. They now live on the
// SermonDetailPage "Render settings" tab and PATCH via
// /sermon/{id}/render-options.

function defaultDeadlineISODate() {
  // Today + 2 days, as a YYYY-MM-DD string. Matches the backend's
  // 2-day default from app/main.py _resolve_service_datetime. The
  // user can override by changing the picker before submit.
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return d.toISOString().split('T')[0]
}

export function SubmitModal({ open, onClose, clients, onSubmitted }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [clientId, setClientId] = useState(clients[0]?.id || '')
  const [url, setUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [deadline, setDeadline] = useState(defaultDeadlineISODate())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Direct-upload state. `uploadProgress` is 0..1 while a PUT is in
  // flight; `uploading` toggles the spinner. `uploadAbort` holds the
  // abort callback returned from uploadFileToR2 so the user can cancel
  // mid-upload (large sermons can take many minutes).
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const uploadAbortRef = useRef(null)

  // Pipeline still lives here — it determines which API endpoint to
  // call (/process-sermon-video vs /process-sermon) and isn't editable
  // after the fact.
  const [pipeline, setPipeline] = useState('video') // 'video' | 'audio'

  React.useEffect(() => {
    if (clients.length) setClientId(clients[0].id)
  }, [clients])

  function handleDragOver(e) { e.preventDefault() }
  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) startUpload(file)
  }
  function handleFile(e) {
    const file = e.target.files[0]
    if (file) startUpload(file)
  }

  // Two-step direct-to-R2 upload:
  //   1. Backend mints a presigned PUT URL scoped to one key + one
  //      content-type.
  //   2. Browser PUTs the file bytes directly to R2 (no Railway in
  //      between). On success we drop the resulting GET URL into the
  //      `url` field and the user can hit Submit as if they'd pasted
  //      a Dropbox link.
  async function startUpload(file) {
    setError('')

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is ${humanBytes(file.size)} — over the ${humanBytes(MAX_UPLOAD_BYTES)} cap. Wrong file, or contact us to raise it.`)
      return
    }

    const contentType = file.type || (pipeline === 'video' ? 'video/mp4' : 'audio/mpeg')

    setFileName(file.name)
    setUploading(true)
    setUploadProgress(0)
    setUrl('')

    try {
      const { put_url, get_url } = await presignUpload({
        filename: file.name,
        contentType,
      })
      const handle = uploadFileToR2(file, put_url, {
        contentType,
        onProgress: (p) => setUploadProgress(p),
      })
      uploadAbortRef.current = handle.abort
      await handle.done
      // Fill the URL field — submit becomes available immediately.
      setUrl(get_url)
    } catch (e) {
      // Distinguish cancel from real failure so the user isn't shown
      // a scary error after they hit Cancel themselves.
      const msg = String(e?.message || e)
      if (msg.includes('cancelled')) {
        setFileName('')
      } else {
        setError(`Upload failed: ${msg}`)
      }
    } finally {
      uploadAbortRef.current = null
      setUploading(false)
    }
  }

  function cancelUpload() {
    if (uploadAbortRef.current) uploadAbortRef.current()
  }

  async function handleSubmit() {
    if (!title.trim()) return setError('Please enter a sermon title.')
    if (!url.trim()) return setError('Please provide a file URL.')
    if (!clientId) return setError('Please select a client.')
    setError('')
    setLoading(true)
    // Deadline is a YYYY-MM-DD; backend wants an ISO timestamp. Use
    // 9am local on that date (a workable "morning deliverable").
    const deadlineISO = deadline ? `${deadline}T09:00:00` : null
    try {
      let result
      if (pipeline === 'video') {
        // No render_options sent — the sermon row gets backend defaults
        // (horizontal, face_tracking on, auto-detect lower-third) and
        // the user can edit them on the detail page after Claude finishes.
        result = await submitSermonVideo({
          client_id: clientId, sermon_title: title, sermon_date: date,
          file_url: url, service_datetime: deadlineISO,
        })
      } else {
        result = await submitSermon({
          client_id: clientId, sermon_title: title, sermon_date: date,
          file_url: url, service_datetime: deadlineISO,
        })
      }
      onSubmitted(result.sermon_id)
      onClose()
      setTitle(''); setUrl(''); setFileName('')
      setDeadline(defaultDeadlineISODate())
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
          <Btn primary onClick={handleSubmit} disabled={loading || uploading}>
            {loading ? 'Submitting…' : (uploading ? 'Uploading…' : 'Submit sermon')}
          </Btn>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormGroup label="Sermon title">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Faith Over Fear" />
        </FormGroup>
        <FormGroup label="Preached on">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </FormGroup>
        <FormGroup label="Deadline">
          <Input
            type="date"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            title="When the church wants the clips by. Defaults to 2 days from now; editable any time on the sermon detail page."
          />
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
            sub="MP4 → clips with captions, render settings editable after submit"
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '1rem 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>or upload directly</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => {
          if (uploading) return
          document.getElementById('file-input-modal').click()
        }}
        style={{
          border: '1px dashed var(--border-mid)',
          borderRadius: 8, padding: '1.5rem',
          textAlign: 'center', cursor: uploading ? 'default' : 'pointer',
          background: 'var(--surface-2)',
          transition: 'background 0.12s',
          opacity: uploading ? 0.95 : 1,
        }}
      >
        <input
          id="file-input-modal"
          type="file"
          accept={acceptTypes}
          style={{ display: 'none' }}
          onChange={handleFile}
          disabled={uploading}
        />
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          {fileName || dropHint}
        </div>
        {!fileName && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>or click to browse</div>
        )}
        {/* Upload progress / completion UI. While uploading, show a bar
            and a Cancel link. When upload completes, the URL field fills
            in automatically — show a checkmark line confirming. */}
        {uploading && (
          <div style={{ marginTop: 12 }}>
            <div style={{
              height: 6, borderRadius: 3, overflow: 'hidden',
              background: 'var(--border)',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.round(uploadProgress * 100)}%`,
                background: 'var(--text)',
                transition: 'width 0.15s',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-3)' }}>
              <span>{Math.round(uploadProgress * 100)}% uploaded</span>
              <button
                onClick={(e) => { e.stopPropagation(); cancelUpload() }}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'var(--text-3)', cursor: 'pointer',
                  fontSize: 11, textDecoration: 'underline',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {!uploading && fileName && url && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
            Uploaded — ready to submit.
          </div>
        )}
      </div>
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
