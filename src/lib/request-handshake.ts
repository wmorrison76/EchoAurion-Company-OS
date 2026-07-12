/**
 * Triple-layer request handshake (Layer 3: timestamp + nonce / replay rejection).
 *
 * Layer 1 — shared secret / HMAC (SUPPORT_INGEST_SECRET, ECHO_AI_KEY, …)
 * Layer 2 — tenant identity (clientKey + SupportClient / system key)
 * Layer 3 — this module: X-Echo-Timestamp + X-Echo-Nonce (+ optional payload hash)
 *
 * See docs/DATA_ISOLATION_AND_COMPLIANCE.md · docs/SECURITY_RELAY.md
 */

import { createHash, randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

const DEFAULT_SKEW_MS = 5 * 60 * 1000 // ±5 minutes
const NONCE_TTL_MS = 24 * 60 * 60 * 1000 // 24h retention for replay table

export type HandshakeResult =
  | { ok: true; enforced: boolean; soft: boolean }
  | { ok: false; status: number; error: string; code: string }

function skewWindowMs(): number {
  const n = Number(process.env.RELAY_HANDSHAKE_SKEW_MS ?? '')
  return Number.isFinite(n) && n >= 30_000 ? n : DEFAULT_SKEW_MS
}

/** When true, missing handshake headers → 401. Default false (soft) during pilot rollout. */
export function handshakeRequired(): boolean {
  const v = (process.env.RELAY_HANDSHAKE_REQUIRED ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

export function readHandshakeHeaders(req: Request): {
  timestamp: string | null
  nonce: string | null
  payloadHash: string | null
  clientKeyHeader: string | null
} {
  return {
    timestamp:
      req.headers.get('x-echo-timestamp') ??
      req.headers.get('x-request-timestamp'),
    nonce: req.headers.get('x-echo-nonce') ?? req.headers.get('x-request-nonce'),
    payloadHash:
      req.headers.get('x-echo-payload-hash') ??
      req.headers.get('x-payload-hash'),
    clientKeyHeader: req.headers.get('x-echo-client-key'),
  }
}

export function hashPayload(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex')
}

/**
 * Build Layer-3 headers for outbound callers (pilot proxy → Company OS).
 */
export function buildHandshakeHeaders(input: {
  clientKey: string
  rawBody?: string
  nonce?: string
}): Record<string, string> {
  const nonce = input.nonce ?? randomUUID()
  const headers: Record<string, string> = {
    'X-Echo-Timestamp': String(Date.now()),
    'X-Echo-Nonce': nonce,
    'X-Echo-Client-Key': input.clientKey,
  }
  if (input.rawBody != null) {
    headers['X-Echo-Payload-Hash'] = hashPayload(input.rawBody)
  }
  return headers
}

/**
 * Persist nonce; reject if already seen (replay).
 * Uses RequestNonce table; falls back to in-memory if migration not applied yet.
 */
const memoryNonces = new Map<string, number>()

async function claimNonce(input: {
  route: string
  nonce: string
  clientKey?: string | null
  deliveryId?: string | null
}): Promise<{ ok: true } | { ok: false; code: string; error: string }> {
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS)
  const key = `${input.route}:${input.nonce}`

  try {
    await db.requestNonce.create({
      data: {
        route: input.route,
        nonce: input.nonce,
        clientKey: input.clientKey ?? null,
        deliveryId: input.deliveryId ?? null,
        expiresAt,
      },
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Unique violation → replay
    if (/unique|duplicate|P2002/i.test(msg)) {
      return {
        ok: false,
        code: 'REPLAY_REJECTED',
        error: 'Replay rejected — nonce already used',
      }
    }
    // Table missing / other DB error → memory fallback
    const now = Date.now()
    // Opportunistic prune
    if (memoryNonces.size > 5000) {
      for (const [k, exp] of memoryNonces) {
        if (exp < now) memoryNonces.delete(k)
      }
    }
    const existing = memoryNonces.get(key)
    if (existing && existing > now) {
      return {
        ok: false,
        code: 'REPLAY_REJECTED',
        error: 'Replay rejected — nonce already used',
      }
    }
    memoryNonces.set(key, expiresAt.getTime())
    return { ok: true }
  }
}

/**
 * Verify Layer-3 handshake. Soft mode allows missing headers (audited).
 * When headers are present, timestamp skew + nonce uniqueness are always enforced.
 */
export async function verifyRequestHandshake(input: {
  req: Request
  route: string
  clientKey?: string | null
  rawBody?: string | null
  /** Force required even if env soft. */
  required?: boolean
  /** External idempotency id (e.g. X-GitHub-Delivery). */
  deliveryId?: string | null
}): Promise<HandshakeResult> {
  const headers = readHandshakeHeaders(input.req)
  const required = input.required ?? handshakeRequired()
  const hasAny =
    Boolean(headers.timestamp) ||
    Boolean(headers.nonce) ||
    Boolean(input.deliveryId)

  if (!hasAny) {
    if (required) {
      return {
        ok: false,
        status: 401,
        error:
          'Handshake required — send X-Echo-Timestamp + X-Echo-Nonce (see docs/SECURITY_RELAY.md)',
        code: 'HANDSHAKE_REQUIRED',
      }
    }
    await audit('computer_agent', 'handshake.soft_missing', undefined, {
      route: input.route,
      clientKey: input.clientKey ?? null,
    }).catch(() => {})
    return { ok: true, enforced: false, soft: true }
  }

  // Timestamp skew
  if (headers.timestamp) {
    const ts = Number(headers.timestamp)
    if (!Number.isFinite(ts)) {
      return {
        ok: false,
        status: 401,
        error: 'Invalid X-Echo-Timestamp',
        code: 'HANDSHAKE_TIMESTAMP_INVALID',
      }
    }
    // Accept seconds or milliseconds
    const ms = ts < 1e12 ? ts * 1000 : ts
    const skew = Math.abs(Date.now() - ms)
    if (skew > skewWindowMs()) {
      return {
        ok: false,
        status: 401,
        error: `Timestamp skew too large (±${Math.round(skewWindowMs() / 1000)}s window)`,
        code: 'HANDSHAKE_SKEW',
      }
    }
  } else if (required && !input.deliveryId) {
    return {
      ok: false,
      status: 401,
      error: 'X-Echo-Timestamp required',
      code: 'HANDSHAKE_REQUIRED',
    }
  }

  // Layer-2 binding: header clientKey must match body/query when both present
  if (
    headers.clientKeyHeader &&
    input.clientKey &&
    headers.clientKeyHeader.trim() !== input.clientKey.trim()
  ) {
    return {
      ok: false,
      status: 403,
      error: 'X-Echo-Client-Key does not match request clientKey',
      code: 'HANDSHAKE_CLIENT_MISMATCH',
    }
  }

  // Optional payload hash binding
  if (headers.payloadHash && input.rawBody != null) {
    const expected = hashPayload(input.rawBody)
    if (headers.payloadHash.toLowerCase() !== expected.toLowerCase()) {
      return {
        ok: false,
        status: 401,
        error: 'Payload hash mismatch',
        code: 'HANDSHAKE_HASH_MISMATCH',
      }
    }
  }

  const nonce =
    headers.nonce?.trim() ||
    (input.deliveryId ? `delivery:${input.deliveryId}` : null)

  if (!nonce) {
    if (required) {
      return {
        ok: false,
        status: 401,
        error: 'X-Echo-Nonce required',
        code: 'HANDSHAKE_REQUIRED',
      }
    }
    return { ok: true, enforced: false, soft: true }
  }

  if (nonce.length < 8 || nonce.length > 200) {
    return {
      ok: false,
      status: 401,
      error: 'Nonce length invalid (8–200)',
      code: 'HANDSHAKE_NONCE_INVALID',
    }
  }

  const claimed = await claimNonce({
    route: input.route,
    nonce,
    clientKey: input.clientKey,
    deliveryId: input.deliveryId,
  })
  if (!claimed.ok) {
    await audit('computer_agent', 'handshake.replay_rejected', undefined, {
      route: input.route,
      clientKey: input.clientKey ?? null,
    }).catch(() => {})
    return {
      ok: false,
      status: 409,
      error: claimed.error,
      code: claimed.code,
    }
  }

  return { ok: true, enforced: true, soft: false }
}

/** Best-effort purge of expired nonces (cron / ops poll). */
export async function purgeExpiredNonces(): Promise<number> {
  try {
    const result = await db.requestNonce.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    return result.count
  } catch {
    return 0
  }
}
