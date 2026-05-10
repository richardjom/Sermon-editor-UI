const BASE = 'https://sermon-editor-production.up.railway.app'

// Audio-only pipeline (legacy). Kept for backward compatibility.
export async function submitSermon({ client_id, sermon_title, sermon_date, file_url }) {
  const res = await fetch(`${BASE}/process-sermon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, sermon_title, sermon_date, file_url }),
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
  client_id, sermon_title, sermon_date, file_url, render_options,
}) {
  const body = { client_id, sermon_title, sermon_date, file_url }
  if (render_options) body.render_options = render_options
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
