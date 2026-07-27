'use client'

import { useEffect } from 'react'

/** Registers the service worker once on the client. Renders nothing. */
export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration is best-effort; the app works without it */
    })
  }, [])
  return null
}
