import { ClerkProvider } from '@clerk/react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthGate } from './AuthGate.jsx'
import './index.css'

// Clerk's publishable key (public by design). If a build doesn't have it —
// e.g. before it's added to Vercel — run without login exactly as before
// rather than crashing the dashboard.
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {CLERK_KEY ? (
      <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
        <AuthGate />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
