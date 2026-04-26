import { useState, useEffect } from 'react'

const STORAGE_KEY = 'sc_clients'

const DEFAULT_CLIENTS = []

export function useClients() {
  const [clients, setClients] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : DEFAULT_CLIENTS
    } catch {
      return DEFAULT_CLIENTS
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients))
  }, [clients])

  function addClient(name, id) {
    setClients(prev => [...prev, { name, id }])
  }

  function removeClient(id) {
    setClients(prev => prev.filter(c => c.id !== id))
  }

  return { clients, addClient, removeClient }
}
