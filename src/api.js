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
export async function renderClip(clipId, { startSeconds, endSeconds } = {}) {
  const body = {}
  if (typeof startSeconds === 'number') body.start_seconds = startSeconds
  if (typeof endSeconds === 'number') body.end_seconds = endSeconds
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
