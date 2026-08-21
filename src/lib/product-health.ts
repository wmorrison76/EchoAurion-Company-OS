/**
 * Public product (luccca-web) /api/health probe — commit + branch only.
 * Used so Dr. OS can compare Company OS SHA vs product SHA.
 * Never logs secrets. Never fails the caller.
 */

const PROBE_TIMEOUT_MS = 2_500
const CACHE_TTL_MS = 45_000
const FALLBACK_PRODUCT_HEALTH = 'https://luccca-web.onrender.com/api/health'

export type ProductHealthIdentity = {
  commit: string | null
  branch: string | null
  reachable: boolean
}

let cache: { url: string; at: number; result: ProductHealthIdentity } | null = null

export function productHealthUrl(): string {
  const echo = process.env.ECHO_AI_URL?.trim()
  if (echo) {
    try {
      return `${new URL(echo).origin}/api/health`
    } catch {
      /* fall through */
    }
  }
  return FALLBACK_PRODUCT_HEALTH
}

export async function probeProductHealth(
  url = productHealthUrl()
): Promise<ProductHealthIdentity> {
  const now = Date.now()
  if (cache && cache.url === url && now - cache.at < CACHE_TTL_MS) {
    return cache.result
  }

  let result: ProductHealthIdentity
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok) {
      result = { commit: null, branch: null, reachable: false }
    } else {
      const body = (await res.json()) as { commit?: unknown; branch?: unknown }
      result = {
        commit: typeof body.commit === 'string' ? body.commit.slice(0, 12) : null,
        branch: typeof body.branch === 'string' ? body.branch.slice(0, 80) : null,
        reachable: true,
      }
    }
  } catch {
    result = { commit: null, branch: null, reachable: false }
  }

  cache = { url, at: now, result }
  return result
}
