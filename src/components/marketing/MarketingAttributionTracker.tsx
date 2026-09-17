'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const INTERNAL_PREFIXES = [
  '/api',
  '/login',
  '/dr-os',
  '/help-desk',
  '/support',
  '/help-files',
  '/financial',
  '/crm',
  '/revenue',
  '/board-room',
  '/fleet-nexus',
  '/knowledge-plane',
  '/maintenance',
  '/aurion-index',
  '/marketing-analytics',
  '/status',
]

const SESSION_KEY = 'echoaurion.marketing.session'
const SENT_PREFIX = 'echoaurion.marketing.sent:'

function clipped(value: string | null, max = 180): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function referrerHost(): string | undefined {
  if (!document.referrer) return undefined
  try {
    return new URL(document.referrer).hostname.toLowerCase().slice(0, 180)
  } catch {
    return undefined
  }
}

function normalizedReferralSource(host?: string): string | undefined {
  if (!host) return undefined
  if (host.includes('linkedin.com') || host === 'lnkd.in') return 'linkedin'
  if (host.includes('instagram.com')) return 'instagram'
  if (host.includes('facebook.com') || host === 'l.facebook.com' || host === 'lm.facebook.com') return 'facebook'
  return host
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const created = randomId()
    sessionStorage.setItem(SESSION_KEY, created)
    return created
  } catch {
    return randomId()
  }
}

function alreadySent(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return true
    sessionStorage.setItem(key, '1')
  } catch {
    // Storage can be unavailable in strict privacy modes. Tracking remains best effort.
  }
  return false
}

/**
 * PII-free public-site attribution.
 *
 * Captures only campaign tags, landing path, referring hostname, and an
 * anonymous tab-session UUID. No IP, email, full referrer URL, or query string
 * is persisted. Internal Company OS routes are excluded.
 */
export function MarketingAttributionTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || INTERNAL_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return

    const params = new URLSearchParams(window.location.search)
    const referrer = referrerHost()
    const utmSource = clipped(params.get('utm_source'))?.toLowerCase()
    const utmMedium = clipped(params.get('utm_medium'))?.toLowerCase()
    const campaign = clipped(params.get('utm_campaign'))
    const content = clipped(params.get('utm_content'))
    const term = clipped(params.get('utm_term'))

    const source = utmSource ?? normalizedReferralSource(referrer) ?? 'direct'
    const medium = utmMedium ?? (referrer ? 'referral' : 'direct')
    const landingPath = pathname.slice(0, 300)
    const visitKey = `${SENT_PREFIX}${landingPath}|${window.location.search.slice(0, 500)}`

    // One event per landing URL per browser tab. A refresh should not inflate traffic.
    if (alreadySent(visitKey)) return

    const body = JSON.stringify({
      sessionId: getSessionId(),
      source,
      medium,
      campaign,
      content,
      term,
      landingPath,
      referrerHost: referrer,
    })

    // sendBeacon survives navigation; fetch is the fallback for environments that
    // do not support Beacon or refuse the queued beacon. Attribution never blocks UX.
    if (navigator.sendBeacon) {
      const queued = navigator.sendBeacon(
        '/api/marketing/visit',
        new Blob([body], { type: 'application/json' })
      )
      if (queued) return
    }

    void fetch('/api/marketing/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined)
  }, [pathname])

  return null
}
