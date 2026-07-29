/**
 * Optional Upstash Redis sliding-window counters (shared across Render instances).
 * When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are unset, callers fall
 * back to in-memory buckets in rate-limit.ts.
 *
 * Uses Upstash REST — no extra npm dependency.
 */

type RedisAllow = { ok: true } | { ok: false; retryAfterSec: number }

function redisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  )
}

/**
 * INCR key with EXPIRE on first hit — approximate fixed window.
 * Good enough for ingest throttles; upgrade to @upstash/ratelimit for smoother windows later.
 */
export async function allowRedisRateLimit(
  key: string,
  max: number,
  windowSec: number
): Promise<RedisAllow | null> {
  if (!redisConfigured()) return null

  const base = process.env.UPSTASH_REDIS_REST_URL!.trim().replace(/\/$/, '')
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim()
  const redisKey = `rl:${key}`

  try {
    const pipeline = [
      ['INCR', redisKey],
      ['TTL', redisKey],
    ]
    const res = await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(pipeline),
    })
    if (!res.ok) return null

    const rows = (await res.json()) as Array<{ result: number | null }>
    const count = typeof rows[0]?.result === 'number' ? rows[0].result : 1
    const ttl = typeof rows[1]?.result === 'number' ? rows[1].result : -1

    if (count === 1 || ttl < 0) {
      await fetch(`${base}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(['EXPIRE', redisKey, windowSec]),
      }).catch(() => {})
    }

    if (count > max) {
      const retryAfterSec = ttl > 0 ? ttl : windowSec
      return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) }
    }
    return { ok: true }
  } catch {
    return null
  }
}

export function redisRateLimitConfigured(): boolean {
  return redisConfigured()
}
