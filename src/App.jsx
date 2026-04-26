import React, { useState } from 'react'
import { Sidebar } from './components/Sidebar.jsx'
import { SubmitModal } from './components/SubmitModal.jsx'
import { AddClientModal } from './components/AddClientModal.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { SermonsPage, ClientPage } from './pages/SermonsPage.jsx'
import { SermonDetailPage } from './pages/SermonDetailPage.jsx'
import { useClients } from './useClients.js'
import { globalStyles } from './components/ui.jsx'

export default function App() {
  const { clients, addClient } = useClients()
  const [page, setPage] = useState('dashboard')
  const [currentClientId, setCurrentClientId] = useState(null)
  const [currentSermonId, setCurrentSermonId] = useState(null)
  const [prevPage, setPrevPage] = useState(null)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [addClientOpen, setAddClientOpen] = useState(false)

  function navigate(p, id, clientId) {
    setPrevPage({ page, currentClientId, currentSermonId })
    setPage(p)
    if (p === 'client') setCurrentClientId(id)
    if (p === 'sermon-detail') {
      setCurrentSermonId(id)
      if (clientId) setCurrentClientId(clientId)
    }
  }

  function goBack() {
    if (prevPage) {
      setPage(prevPage.page)
      setCurrentClientId(prevPage.currentClientId)
      setCurrentSermonId(prevPage.currentSermonId)
      setPrevPage(null)
    } else {
      setPage('dashboard')
    }
  }

  function handleAddClient() { setAddClientOpen(true) }

  function handleSubmitted(sermonId) {
    navigate('sermon-detail', sermonId, currentClientId)
  }

  const currentClient = clients.find(c => c.id === currentClientId)

  return (
    <>
      <style>{globalStyles}</style>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          clients={clients}
          currentPage={page}
          currentClientId={currentClientId}
          onNavigate={navigate}
          onAddClient={handleAddClient}
        />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {page === 'dashboard' && (
            <DashboardPage
              clients={clients}
              onNavigate={navigate}
              onSubmit={() => setSubmitOpen(true)}
            />
          )}
          {page === 'sermons' && (
            <SermonsPage
              clients={clients}
              onNavigate={navigate}
              onSubmit={() => setSubmitOpen(true)}
            />
          )}
          {page === 'client' && (
            <ClientPage
              client={currentClient}
              onNavigate={navigate}
              onSubmit={() => setSubmitOpen(true)}
            />
          )}
          {page === 'sermon-detail' && (
            <SermonDetailPage
              sermonId={currentSermonId}
              clientId={currentClientId}
              clients={clients}
              onBack={goBack}
            />
          )}
        </main>
      </div>

      <SubmitModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        clients={clients}
        onSubmitted={handleSubmitted}
      />
      <AddClientModal
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onAdd={addClient}
      />
    </>
  )
}
