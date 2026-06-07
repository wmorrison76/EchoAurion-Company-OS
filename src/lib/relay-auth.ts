export type RelayAuth = { ok: true } | { ok: false; status: number; error: string }

/**
 * Bearer-secret guard for deployment-facing relay endpoints (the product calls
 * these, not the admin session). Disabled entirely until SUPPORT_INGEST_SECRET
 * is set — nothing is reachable by default.
 */
export function relayAuthorized(req: Request): RelayAuth {
  const secret = process.env.SUPPORT_INGEST_SECRET
  if (!secret) return { ok: false, status: 503, error: 'Relay disabled' }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  return { ok: true }
}
