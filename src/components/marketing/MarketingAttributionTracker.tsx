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
    return new URL(document.referrer).hostname.slice(0, 180)
  } catch {
    return undefined
  }
}

function sessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  sessionStorage.setItem(SESSION_KEY, created)
  return created
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
    const utmSource = clipped(params.get('utm_source'))
    const utmMedium = clipped(params.get('utm_medium'))
    const campaign = clipped(params.get('utm_campaign'))
    const content = clipped(params.get('utm_content'))
    const term = clipped(params.get('utm_term'))

    const source = utmSource ?? referrer ?? 'direct'
    const medium = utmMedium ?? (referrer ? 'referral' : 'direct')
    const landingPath = pathname.slice(0, 300)
    const visitKey = `${SENT_PREFIX}${landingPath}|${window.location.search.slice(0, 500)}`

    // One event per landing URL per browser tab. A refresh should not inflate traffic.
    if (sessionStorage.getItem(visitKey)) return
    sessionStorage.setItem(visitKey, '1')

    const body = JSON.stringify({
      sessionId: sessionId(),
      source,
      medium,
      campaign,
      content,
      term,
      landingPath,
      referrerHost: referrer,
    })

    // sendBeacon survives navigation; fetch is the fallback for environments that
    // do not support Beacon. Attribution must never block the user experience.
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/marketing/visit', new Blob([body], { type: 'application/json' }))
      return
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
