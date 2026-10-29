import React, { useEffect, useState } from 'react'
import { Show, SignIn, UserButton, useAuth, useOrganizationList } from '@clerk/react'
import App from './App.jsx'
import { getMe, setAuthTokenGetter } from './api.js'
import { Portal } from './portal/Portal.jsx'

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

// How long to wait for Clerk's organization list before routing anyway
// (e.g. if organizations are switched off for the instance).
const ORG_WAIT_MS = 5000

function SignedInApp() {
  const { getToken, orgId, isLoaded } = useAuth()
  // Set during render, not in an effect: child effects run before parent
  // effects, so App's first fetches would otherwise go out without a token.
  // Reassigning a module-level getter is idempotent, so this is safe.
  setAuthTokenGetter(() => getToken())

  // The API recognizes a church by the ACTIVE organization in the token.
  // A church member with one org may not have it active yet, so pick it.
  const { isLoaded: orgsLoaded, userMemberships, setActive } = useOrganizationList({ userMemberships: true })
  const firstOrg = userMemberships?.data?.[0]?.organization?.id
  const needsActiveOrg = orgsLoaded && !orgId && !!firstOrg
  useEffect(() => {
    if (needsActiveOrg) setActive({ organization: firstOrg })
  }, [needsActiveOrg, firstOrg, setActive])

  const [orgWaitOver, setOrgWaitOver] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOrgWaitOver(true), ORG_WAIT_MS)
    return () => clearTimeout(t)
  }, [])

  // Ask the API who we are; re-ask when the active org changes.
  const [me, setMe] = useState(null)
  useEffect(() => {
    if (!isLoaded || needsActiveOrg) return
    let cancelled = false
    setMe(null)
    getMe()
      .then(d => !cancelled && setMe(d))
      .catch(() => !cancelled && setMe({ role: 'unknown' }))
    return () => { cancelled = true }
  }, [isLoaded, needsActiveOrg, orgId])

  const account = <UserButton showName />
  const settlingOrg = needsActiveOrg || (!orgsLoaded && !orgWaitOver)

  if (!me || (me.role === 'member' && settlingOrg)) return <CenteredScreen><span style={styles.sub}>Loading…</span></CenteredScreen>
  if (me.role === 'church') return <Portal account={account} />
  // 'unknown' = /me failed (network, backend down): fall back to The Editor
  // rather than locking staff out; the API still decides what it serves.
  if (me.role === 'staff' || me.role === 'unknown') return <App account={account} />
  return <NotConnectedScreen account={account} />
}

function SignInScreen() {
  return (
    <CenteredScreen>
      {/* No router in this app, so Clerk keeps its multi-step flow in the URL hash. */}
      <SignIn routing="hash" />
    </CenteredScreen>
  )
}

function NotConnectedScreen({ account }) {
  return (
    <CenteredScreen>
      <div style={styles.card}>
        <div style={styles.title}>Your account isn’t connected to a church yet</div>
        <p style={styles.body}>
          Ask your Sunday Cues contact to send an invite to your church’s team, then sign in again.
        </p>
        <div>{account}</div>
      </div>
    </CenteredScreen>
  )
}

function CenteredScreen({ children }) {
  return (
    <div style={styles.page}>
      <div style={styles.brand}>
        <div style={styles.logoMark}>SC</div>
        <div>
          <div style={styles.title}>The Editor</div>
          <div style={styles.sub}>Sunday Cues</div>
        </div>
      </div>
      {children}
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
  card: {
    maxWidth: 400,
    padding: 24,
    borderRadius: 12,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    textAlign: 'center',
    alignItems: 'center',
  },
  body: { margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--text-2)' },
}
