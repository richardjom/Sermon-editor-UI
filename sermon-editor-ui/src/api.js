const BASE = 'https://sermon-editor-production.up.railway.app'

export async function submitSermon({ client_id, sermon_title, sermon_date, file_url }) {
  const res = await fetch(`${BASE}/process-sermon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, sermon_title, sermon_date, file_url }),
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
