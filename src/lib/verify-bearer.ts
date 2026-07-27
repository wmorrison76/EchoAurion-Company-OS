import { timingSafeEqual } from 'crypto'

/**
 * Constant-time check of `Authorization: Bearer <secret>`.
 * Replaces the plain `authz !== \`Bearer ${secret}\`` string comparisons on
 * cron/ops routes so header checks match the timing-safe discipline the
 * webhooks already follow (SECURITY_RELAY.md Layer 1). Returns false when the
 * secret is unset — fail closed.
 */
export function verifyBearerSecret(req: Request, secret: string | undefined | null): boolean {
  if (!secret) return false
  const authz = req.headers.get('authorization') ?? ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const provided = Buffer.from(authz)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

/** Convenience for the standard cron gate. */
export function verifyCronBearer(req: Request): boolean {
  return verifyBearerSecret(req, process.env.CRON_SECRET)
}
