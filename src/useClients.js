import { useState, useEffect, useCallback } from 'react'
import { listClients } from './api.js'

/**
 * Backend-backed clients list.
 *
 * Used to be localStorage-only; now reads from GET /clients (which is
 * populated by the migration seed + auto-created whenever a sermon is
 * submitted with a new client_id). On mount: fetch once. addClient()
 * optimistically appends a placeholder so the Add Client modal feels
 * responsive — the backend doesn't have an explicit POST /clients
 * endpoint yet, so the placeholder gets replaced by the real row on
 * the next refresh (after the user submits a sermon for that client,
 * which triggers _ensure_client_exists on the backend).
 */
export function useClients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await listClients()
      setClients(data.clients || [])
    } catch (e) {
      // App should still run if /clients hiccups — the dashboard has
      // its own copy via /dashboard, and submit auto-creates on the
      // backend anyway. Log and move on.
      // eslint-disable-next-line no-console
      console.warn('Failed to load clients:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  function addClient(name, id) {
    setClients(prev => {
      if (prev.some(c => c.id === id)) return prev
      // Mirror the backend's _ensure_client_exists placeholder shape so
      // the sidebar avatar shows up immediately.
      const monogram = (name || id).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
      return [...prev, {
        id,
        name,
        monogram,
        avatar_color: '#e7e3d8',
        avatar_fg_color: '#3f3f46',
        default_deadline_offset_days: 2,
      }]
    })
  }

  return { clients, loading, addClient, refresh }
}
