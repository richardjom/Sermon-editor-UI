const BASE = 'https://sermon-editor-production.up.railway.app'

// Audio-only pipeline (legacy). Kept for backward compatibility.
export async function submitSermon({ client_id, sermon_title, sermon_date, file_url, service_datetime }) {
  const body = { client_id, sermon_title, sermon_date, file_url }
  if (service_datetime) body.service_datetime = service_datetime
  const res = await fetch(`${BASE}/process-sermon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Video pipeline (Phase 4). render_options is optional; when provided,
// each field is independently optional and defaults to safe values.
//
// Shape of render_options:
//   {
//     vertical: boolean,             // 9:16 reframe
//     face_tracking: boolean,        // follow speaker with AI (vertical only)
//     crop_lower_third: boolean,     // drop bottom 30% before reframe
//     // brand_color, logo_url come in PR 2/3
//   }
export async function submitSermonVideo({
  client_id, sermon_title, sermon_date, file_url, render_options, service_datetime,
}) {
  const body = { client_id, sermon_title, sermon_date, file_url }
  if (render_options) body.render_options = render_options
  if (service_datetime) body.service_datetime = service_datetime
  const res = await fetch(`${BASE}/process-sermon-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getSermon(id) {
  const res = await fetch(`${BASE}/sermon/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getClientSermons(clientId) {
  const res = await fetch(`${BASE}/clients/${clientId}/sermons`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function reprocessSermon(id) {
  const res = await fetch(`${BASE}/admin/reprocess/${id}`, { method: 'POST' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Render-on-demand for a single clip. Two main uses:
//   - "Render now" on an un-rendered clip → no options
//   - Trim → pass new in/out as start_seconds + end_seconds
// Backend queues a background task and returns immediately; poll
// GET /sermon/{sermon_id} for completion (rendered_video_url appears).
export async function renderClip(clipId, { startSeconds, endSeconds, captionPosition, captionOutline, captionFont, captionUppercase, captionBold, captionHighlight, manualFrameX, vertical } = {}) {
  const body = {}
  if (typeof startSeconds === 'number') body.start_seconds = startSeconds
  if (typeof endSeconds === 'number') body.end_seconds = endSeconds
  // Caption editor per-clip overrides. Omitted → backend uses the
  // sermon template/render_options exactly as before.
  if (typeof captionPosition === 'number') body.caption_position = captionPosition
  if (typeof captionOutline === 'number') body.caption_outline = captionOutline
  if (typeof captionFont === 'string' && captionFont) body.caption_font = captionFont
  if (typeof captionUppercase === 'boolean') body.caption_uppercase = captionUppercase
  if (typeof captionBold === 'boolean') body.caption_bold = captionBold
  // Karaoke active-word highlight: "none" disables the pop, "#RRGGBB" recolors it.
  if (typeof captionHighlight === 'string' && captionHighlight) body.caption_highlight = captionHighlight
  // Manual framing (0-100, 50=center) for vertical output; skips face tracking.
  if (typeof manualFrameX === 'number') body.manual_frame_x = manualFrameX
  // Per-clip export aspect (9:16 vs 16:9) from the caption editor toggle.
  if (typeof vertical === 'boolean') body.vertical = vertical
  const res = await fetch(`${BASE}/clip/${clipId}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Create a custom clip on an existing sermon at a user-supplied
// time range. The backend snaps start/end to the nearest word
// boundaries when the sermon has word_transcript_json. Set
// render=true to queue an immediate render of the new clip.
export async function createCustomClip(sermonId, {
  startSeconds, endSeconds, title, suggestedHook, suggestedCaption,
  transcript, whyItWorks, strength, render,
} = {}) {
  const body = {
    start_seconds: startSeconds,
    end_seconds: endSeconds,
  }
  if (title) body.title = title
  if (suggestedHook) body.suggested_hook = suggestedHook
  if (suggestedCaption) body.suggested_caption = suggestedCaption
  if (transcript) body.transcript = transcript
  if (whyItWorks) body.why_it_works = whyItWorks
  if (strength) body.strength = strength
  if (typeof render === 'boolean') body.render = render
  const res = await fetch(`${BASE}/sermons/${sermonId}/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || 'create-clip failed'}`)
  }
  return res.json()
}

// Bulk-render every unrendered clip on a sermon, sequentially.
// Backend queues a single background task so concurrent ffmpeg
// renders don't OOM Railway.
export async function renderAllClips(sermonId, { onlyHigh = false } = {}) {
  const res = await fetch(`${BASE}/sermons/${sermonId}/render-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ only_high: onlyHigh }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Partial-update of a sermon's render_options. Only fields present
// in the `patch` object are written; absent fields keep their
// existing value. Used by the post-submit "Render settings" tab so
// the user can edit options after seeing the clips, rather than
// committing at submit time.
//
// Examples:
//   updateRenderOptions(id, { vertical: true })            // turn vertical on
//   updateRenderOptions(id, { face_tracking: false })      // disable face tracking
//   updateRenderOptions(id, { crop_lower_third: null })    // back to auto-detect
export async function updateRenderOptions(sermonId, patch) {
  const res = await fetch(`${BASE}/sermon/${sermonId}/render-options`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch || {}),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || 'render-options update failed'}`)
  }
  return res.json()
}

// Dashboard backbone (VE1 deadline-queue spec)
// -------------------------------------------------------------------
// These power the upcoming Deadline Queue dashboard. listJobs is the
// primary feed; listClients / clientsSummary / workload power the
// secondary cards; updateDeadline + markDelivered / unmarkDelivered
// let the editor adjust scheduling without leaving the row.

export async function listJobs({ active = true, limit = 100 } = {}) {
  const qs = new URLSearchParams({ active: String(active), limit: String(limit) })
  const res = await fetch(`${BASE}/jobs?${qs}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Single-call dashboard payload — equivalent to listJobs +
// clientsSummary + workload, but one HTTP round-trip instead of
// three. Returns { jobs, now, clients, workload: { days } }.
export async function getDashboard({ active = true, jobsLimit = 200, workloadDays = 7 } = {}) {
  const qs = new URLSearchParams({
    active: String(active),
    jobs_limit: String(jobsLimit),
    workload_days: String(workloadDays),
  })
  const res = await fetch(`${BASE}/dashboard?${qs}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function listClients() {
  const res = await fetch(`${BASE}/clients`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function updateClient(clientId, patch) {
  const res = await fetch(`${BASE}/clients/${clientId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch || {}),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function clientsSummary() {
  const res = await fetch(`${BASE}/clients/summary`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function workload({ days = 7 } = {}) {
  const res = await fetch(`${BASE}/workload?days=${days}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function updateDeadline(sermonId, serviceDatetime) {
  // Pass null to clear, ISO string to reschedule.
  const body = { service_datetime: serviceDatetime }
  const res = await fetch(`${BASE}/sermon/${sermonId}/deadline`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function markDelivered(sermonId) {
  const res = await fetch(`${BASE}/sermon/${sermonId}/mark-delivered`, { method: 'POST' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function unmarkDelivered(sermonId) {
  const res = await fetch(`${BASE}/sermon/${sermonId}/unmark-delivered`, { method: 'POST' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}


// Hard-delete a sermon, its clips, and its R2 storage. Notion clip
// pages are intentionally NOT touched; archive those manually if
// needed.
export async function deleteSermon(sermonId) {
  const res = await fetch(`${BASE}/sermon/${sermonId}`, { method: 'DELETE' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || 'delete failed'}`)
  }
  return res.json()
}

// ----- PDF export URL builders -----
// These return URLs that the browser can hit directly (the backend
// sends Content-Disposition: attachment so the browser shows a Save
// dialog). No fetch+blob roundtrip needed — just `window.location.href
// = transcriptPdfUrl(id)` or an <a href download>.

export function transcriptPdfUrl(sermonId) {
  return `${BASE}/sermon/${sermonId}/transcript.pdf`
}

// `clipIds` is the array of clip IDs the user wants in the doc — pass
// the IDs of the currently visible/filtered clips. Omit to export every
// clip in the sermon.
export function clipsPdfUrl(sermonId, clipIds) {
  if (!clipIds || !clipIds.length) {
    return `${BASE}/sermon/${sermonId}/clips.pdf`
  }
  const qs = new URLSearchParams({ ids: clipIds.join(',') }).toString()
  return `${BASE}/sermon/${sermonId}/clips.pdf?${qs}`
}

// ----- Direct-to-R2 upload -----
// Two-step flow: mint a presigned PUT URL from our backend, then PUT
// the file directly to R2. The browser never touches Railway with the
// file bytes — Railway has request-body / timeout limits that would
// kill a multi-GB sermon upload. See app/services/storage.py and the
// /uploads/presign endpoint for the backend side.

export async function presignUpload({ filename, contentType }) {
  const res = await fetch(`${BASE}/uploads/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, content_type: contentType || 'video/mp4' }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || 'presign failed'}`)
  }
  return res.json()  // { r2_key, put_url, get_url }
}

// Upload a File to a presigned PUT URL using XHR (so we can report
// progress — fetch() doesn't expose upload progress events natively).
// Returns a Promise that resolves when the upload completes; calls
// onProgress(0..1) periodically while running. Abortable via the
// returned `abort()` function.
export function uploadFileToR2(file, putUrl, { onProgress, contentType } = {}) {
  const xhr = new XMLHttpRequest()
  const done = new Promise((resolve, reject) => {
    xhr.open('PUT', putUrl, true)
    // Must match the Content-Type the URL was signed with, or R2 rejects
    // the PUT with a signature-mismatch error.
    xhr.setRequestHeader('Content-Type', contentType || file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`R2 PUT failed: HTTP ${xhr.status} ${xhr.responseText?.slice(0, 200) || ''}`))
    }
    xhr.onerror = () => reject(new Error('R2 PUT network error (check bucket CORS for PUT from this origin)'))
    xhr.onabort = () => reject(new Error('Upload cancelled'))
    xhr.send(file)
  })
  return { done, abort: () => xhr.abort() }
}
