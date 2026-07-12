/**
 * In-memory sliding-window rate limit (per Render instance).
 * Shared by forgot-password and relay ingest endpoints.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Allow up to `max` hits per `windowMs`. Returns true if allowed.
 * Never logs the key if it may contain secrets.
 */
export function allowRateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }
  if (bucket.count >= max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  bucket.count += 1
  if (buckets.size > 2000) {
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k)
    }
  }
  return { ok: true }
}

/** Convenience: once-per-window (legacy forgot-password style). */
export function allowOnce(key: string, windowMs: number): boolean {
  return allowRateLimit(key, 1, windowMs).ok
}
