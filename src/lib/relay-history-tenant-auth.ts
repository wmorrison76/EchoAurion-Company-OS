/**
 * Strict, per-installation authorization for private Help Desk history reads.
 * Does NOT grant user-level access: a product backend must independently
 * authenticate its end user before proxying a requested userId.
 *
 * The legacy shared SUPPORT_INGEST_SECRET is deliberately NOT accepted here.
 * Existing installation credentials must be provisioned/migrated before rollout.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'

export type TenantHistoryAuth =
  | { ok: true; clientKey: string }
  | { ok: false; status: number; code: string; error: string }

function unauthorized(): TenantHistoryAuth {
  return { ok: false, status: 401, code: 'INSTALLATION_CREDENTIAL_REQUIRED', error: 'Unauthorized installation' }
}

function compareDigest(token: string, stored: string): boolean {
  // Legacy cleartext credentials are not accepted on privacy-sensitive reads.
  if (!/^[a-f0-9]{64}$/i.test(stored)) return false
  const hash = createHash('sha256').update(token, 'utf8').digest()
  const expected = Buffer.from(stored, 'hex')
  return expected.length === hash.length && timingSafeEqual(hash, expected)
}

export async function authorizeRelayHistoryRead(input: {
  req: Request
  clientKey: string
}): Promise<TenantHistoryAuth> {
  const clientKey = input.clientKey.trim()
  if (!clientKey || clientKey.length > 200 || /[\r\n]/.test(clientKey)) {
    return unauthorized()
  }

  const declared = input.req.headers.get('x-echo-client-key')
  if (declared && declared.trim() !== clientKey) return unauthorized()

  const authorization = input.req.headers.get('authorization') ?? ''
  const bearer = /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1]
  // Enforce a dedicated, strong installation credential. No shared fallback.
  if (!bearer || bearer.length < 32 || bearer.length > 512) return unauthorized()

  // Never grant private history access with the fleet-wide shared relay secret,
  // even if an installation was accidentally provisioned with its digest.
  const fleetSecret = process.env.SUPPORT_INGEST_SECRET
  if (fleetSecret && bearer === fleetSecret) return unauthorized()

  try {
    const client = await db.supportClient.findUnique({
      where: { clientKey },
      select: { ingestSecretHash: true },
    })
    if (!client?.ingestSecretHash || !compareDigest(bearer, client.ingestSecretHash.trim())) {
      return unauthorized()
    }
    return { ok: true, clientKey }
  } catch {
    // Outage must not become a shared-secret or unscoped fail-open path.
    return {
      ok: false,
      status: 503,
      code: 'INSTALLATION_AUTH_UNAVAILABLE',
      error: 'Installation authorization unavailable',
    }
  }
}
