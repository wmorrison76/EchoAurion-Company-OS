import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

const ADMIN_AUTH_ID = 'admin'
const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

/** Keep in sync with client copy in ResetPasswordForm (avoid importing this module in client). */
export const MIN_PASSWORD_LENGTH = 12

/** Prefer DB override hash; fall back to ADMIN_PASSWORD_HASH env. */
export async function resolveAdminPasswordHash(): Promise<string | null> {
  try {
    const row = await db.adminAuth.findUnique({ where: { id: ADMIN_AUTH_ID } })
    if (row?.passwordHash) return row.passwordHash
  } catch (err) {
    // Table may not exist yet mid-migrate — fall through to env.
    console.error('[admin-password] DB lookup failed, using env hash:', err)
  }
  return process.env.ADMIN_PASSWORD_HASH ?? null
}

export async function setAdminPasswordHash(password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12)
  await db.adminAuth.upsert({
    where: { id: ADMIN_AUTH_ID },
    create: { id: ADMIN_AUTH_ID, passwordHash },
    update: { passwordHash },
  })
}

export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function generateResetToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString('hex')
  return {
    raw,
    hash: hashResetToken(raw),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  }
}

/** Best-effort in-memory rate limit (per Render instance). */
const rateBuckets = new Map<string, number>()

export function checkRateLimit(key: string, windowMs = 5 * 60 * 1000): boolean {
  const now = Date.now()
  const last = rateBuckets.get(key)
  if (last !== undefined && now - last < windowMs) return false
  rateBuckets.set(key, now)
  // Opportunistic prune
  if (rateBuckets.size > 500) {
    for (const [k, t] of rateBuckets) {
      if (now - t >= windowMs) rateBuckets.delete(k)
    }
  }
  return true
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}
