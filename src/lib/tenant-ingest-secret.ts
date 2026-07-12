/**
 * Per-tenant ingest secret verify + shared-secret fallback.
 * Prefer hash on SupportClient; shared SUPPORT_INGEST_SECRET until all migrate.
 * Never log secret values.
 */

import { createHash, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'

export type TenantSecretResult =
  | { ok: true; mode: 'shared' | 'per_tenant' }
  | { ok: false; status: number; error: string; code: string }

/** Hash plaintext for storage (sha256 hex). Prefer bcrypt in production rotation. */
export function hashIngestSecret(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

/**
 * If clientKey has ingestSecretHash set, Bearer must match that hash.
 * Else fall back to shared SUPPORT_INGEST_SECRET (deprecation path).
 * Call after shared bearer already passed OR when probing per-tenant only.
 */
export async function verifyClientIngestSecret(input: {
  clientKey: string
  bearerToken: string | null
  /** True when shared SUPPORT_INGEST_SECRET already matched. */
  sharedOk: boolean
}): Promise<TenantSecretResult> {
  const client = await db.supportClient.findUnique({
    where: { clientKey: input.clientKey },
    select: { ingestSecretHash: true },
  })

  const stored = client?.ingestSecretHash?.trim()
  if (!stored) {
    // No per-tenant secret — shared path (documented deprecation).
    if (input.sharedOk) return { ok: true, mode: 'shared' }
    return {
      ok: false,
      status: 401,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    }
  }

  const token = input.bearerToken?.trim()
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'Per-install secret required for this client',
      code: 'TENANT_SECRET_REQUIRED',
    }
  }

  const candidate = hashIngestSecret(token)
  if (safeEqualHex(candidate, stored) || token === stored) {
    // Allow stored as hash hex OR legacy direct compare if operator stored hash wrongly as plain — prefer hash.
    return { ok: true, mode: 'per_tenant' }
  }

  // If shared matched but per-tenant is set, still require per-tenant (stricter).
  return {
    ok: false,
    status: 401,
    error: 'Per-install secret mismatch',
    code: 'TENANT_SECRET_MISMATCH',
  }
}

/**
 * Soft check used by relay after shared auth: if client registered with hash,
 * re-verify bearer against hash. No-op when no hash.
 */
export async function enforcePerTenantSecretIfSet(input: {
  clientKey: string
  req: Request
  sharedOk: boolean
}): Promise<TenantSecretResult> {
  const header = input.req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return verifyClientIngestSecret({
    clientKey: input.clientKey,
    bearerToken: match?.[1] ?? null,
    sharedOk: input.sharedOk,
  })
}
