import { createHmac, timingSafeEqual } from 'crypto'
import { allowRateLimit, clientIp } from '@/lib/rate-limit'

export type RelayAuth =
  | { ok: true; clientKeyFromToken?: string }
  | { ok: false; status: number; error: string; code: string }

/**
 * Bearer-secret guard for deployment-facing relay endpoints (the product calls
 * these, not the admin session). Disabled entirely until SUPPORT_INGEST_SECRET
 * is set — nothing is reachable by default.
 *
 * Also accepts a short-lived signed query token for SSE EventSource (which
 * cannot set Authorization headers): `?token=<base64url.payload>.<hmac>`.
 *
 * Never log Authorization header values.
 */
export function relayAuthorized(req: Request, opts?: { allowQueryToken?: boolean }): RelayAuth {
  const secret = process.env.SUPPORT_INGEST_SECRET?.trim()
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error:
        'Relay disabled — set SUPPORT_INGEST_SECRET on Company OS (match luccca-web COMPANY_OS_INGEST_SECRET). See docs/CONNECT_PILOT_TO_COMPANY_OS.md',
      code: 'RELAY_DISABLED',
    }
  }

  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  // Trim bearer token — Render/env paste can leave trailing whitespace on either side.
  if (match && match[1].trim() === secret) {
    return { ok: true }
  }

  if (opts?.allowQueryToken) {
    const token = new URL(req.url).searchParams.get('token')
    if (token) {
      const verified = verifyStreamToken(token, secret)
      if (verified.ok) return { ok: true, clientKeyFromToken: verified.clientKey }
      return {
        ok: false,
        status: 401,
        error: verified.error,
        code: verified.code,
      }
    }
  }

  return { ok: false, status: 401, error: 'Unauthorized — Bearer does not match SUPPORT_INGEST_SECRET (secret mismatch or wrong token). If whoami returns 401 with a wrong bearer, the secret is live on Company OS; luccca-web COMPANY_OS_INGEST_SECRET must match exactly.', code: 'UNAUTHORIZED' }
}

/** Per-IP rate limits after auth (limits abuse if secret leaks). */
export function relayRateLimited(
  req: Request,
  kind: 'heartbeat' | 'questions' | 'work' | 'diagnostics' | 'default'
): RelayAuth {
  const limits: Record<typeof kind, { max: number; windowMs: number }> = {
    heartbeat: { max: 120, windowMs: 60_000 },
    questions: { max: 30, windowMs: 60_000 },
    work: { max: 20, windowMs: 60_000 },
    diagnostics: { max: 60, windowMs: 60_000 },
    default: { max: 90, windowMs: 60_000 },
  }
  const { max, windowMs } = limits[kind]
  const ip = clientIp(req)
  const result = allowRateLimit(`relay:${kind}:${ip}`, max, windowMs)
  if (!result.ok) {
    return {
      ok: false,
      status: 429,
      error: `Rate limited — retry in ${result.retryAfterSec}s`,
      code: 'RATE_LIMITED',
    }
  }
  return { ok: true }
}

/** Auth then rate-limit. */
export function relayGuard(
  req: Request,
  kind: 'heartbeat' | 'questions' | 'work' | 'diagnostics' | 'default',
  opts?: { allowQueryToken?: boolean }
): RelayAuth {
  const a = relayAuthorized(req, opts)
  if (!a.ok) return a
  const r = relayRateLimited(req, kind)
  if (!r.ok) return r
  return a
}

/** Require clientKey query/body presence with a clear pilot-debug code. */
export function requireClientKey(value: string | null | undefined): {
  ok: true
  clientKey: string
} | { ok: false; status: number; error: string; code: string } {
  const clientKey = value?.trim()
  if (!clientKey) {
    return {
      ok: false,
      status: 400,
      error: 'clientKey is required',
      code: 'CLIENT_KEY_REQUIRED',
    }
  }
  if (clientKey.length > 200) {
    return {
      ok: false,
      status: 400,
      error: 'clientKey too long (max 200)',
      code: 'CLIENT_KEY_INVALID',
    }
  }
  return { ok: true, clientKey }
}

interface StreamTokenPayload {
  clientKey: string
  exp: number
}

/**
 * Create a signed stream token (default TTL 1 hour) for EventSource clients.
 * Payload is base64url(JSON) + '.' + hex HMAC-SHA256.
 */
export function createStreamToken(
  clientKey: string,
  ttlSeconds = 3600,
  secret = process.env.SUPPORT_INGEST_SECRET?.trim()
): string | null {
  if (!secret) return null
  const payload: StreamTokenPayload = {
    clientKey,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('hex')
  return `${body}.${sig}`
}

function verifyStreamToken(
  token: string,
  secret: string
): { ok: true; clientKey: string } | { ok: false; error: string; code: string } {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: 'Invalid stream token', code: 'TOKEN_INVALID' }
  }
  const [body, sig] = parts
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: 'Invalid stream token signature', code: 'TOKEN_INVALID' }
    }
  } catch {
    return { ok: false, error: 'Invalid stream token signature', code: 'TOKEN_INVALID' }
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StreamTokenPayload
    if (!payload.clientKey || typeof payload.exp !== 'number') {
      return { ok: false, error: 'Invalid stream token payload', code: 'TOKEN_INVALID' }
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: 'Stream token expired', code: 'TOKEN_EXPIRED' }
    }
    return { ok: true, clientKey: payload.clientKey }
  } catch {
    return { ok: false, error: 'Invalid stream token payload', code: 'TOKEN_INVALID' }
  }
}
