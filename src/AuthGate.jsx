import React from 'react'
import { Show, SignIn, UserButton, useAuth } from '@clerk/react'
import App from './App.jsx'
import { setAuthTokenGetter } from './api.js'

// Signed out → Clerk sign-in. Signed in → the app, with every API call
// carrying the session token (see api.js).
export function AuthGate() {
  return (
    <>
      <Show when="signed-out">
        <SignInScreen />
      </Show>
      <Show when="signed-in">
        <SignedInApp />
      </Show>
    </>
  )
}

function SignedInApp() {
  const { getToken } = useAuth()
  // Set during render, not in an effect: child effects run before parent
  // effects, so App's first fetches would otherwise go out without a token.
  // Reassigning a module-level getter is idempotent, so this is safe.
  setAuthTokenGetter(() => getToken())
  return <App account={<UserButton showName />} />
}

function SignInScreen() {
  return (
    <div style={styles.page}>
      <div style={styles.brand}>
        <div style={styles.logoMark}>SC</div>
        <div>
          <div style={styles.title}>The Editor</div>
          <div style={styles.sub}>Sunday Cues</div>
        </div>
      </div>
      {/* No router in this app, so Clerk keeps its multi-step flow in the URL hash. */}
      <SignIn routing="hash" />
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    padding: '2rem 16px',
    background: 'var(--bg)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: 'var(--text)',
    color: 'var(--surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  title: { fontSize: 15, fontWeight: 500, color: 'var(--text)' },
  sub: { fontSize: 12, color: 'var(--text-3)', marginTop: 1 },
}
