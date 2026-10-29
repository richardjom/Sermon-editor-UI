import { useEffect, useState } from 'react'

// Light / dark for the whole app (The Editor and the church portal).
// Starts from the device setting; the toggle overrides it and the choice is
// remembered on this device. index.html applies it before first paint.
const KEY = 'theme'

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {}
  return 'light'
}

let current = initialTheme()
const listeners = new Set()

function apply(theme) {
  current = theme
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(KEY, theme) } catch {}
  listeners.forEach(fn => fn(theme))
}

export function useTheme() {
  const [theme, setTheme] = useState(current)
  useEffect(() => {
    listeners.add(setTheme)
    return () => listeners.delete(setTheme)
  }, [])
  return [theme, () => apply(current === 'dark' ? 'light' : 'dark')]
}
