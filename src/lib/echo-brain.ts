/**
 * Chef's Brain (Echo AI) — luccca-web echo-brain proxy wiring.
 * Company OS posts prompts to ECHO_AI_URL; Connection Health probes readiness.
 */

/** Canonical Render value for echoaurion-company-os → luccca-web. */
export const SUGGESTED_ECHO_AI_URL =
  'https://luccca-web.onrender.com/api/company-os/echo-brain'

const PROBE_TIMEOUT_MS = 2_500

/** In-process cache so Dr. OS 60s polls do not hammer luccca-web. */
let probeCache: {
  url: string
  at: number
  result: ChefsBrainProbeResult
} | null = null

const CACHE_TTL_MS = 45_000

export type ChefsBrainProbeResult = {
  /** Endpoint looks alive (not unset / not 404 / not network fail). */
  ok: boolean
  httpStatus: number | null
  detail: string
}

/**
 * GET ECHO_AI_URL (optional Bearer ECHO_AI_KEY).
 * Treat 2xx / 401 / 403 / 405 as path OK (auth may be required for POST).
 * 404 or network error → not OK (wrong path or pilot down).
 */
export async function probeChefsBrain(
  url = process.env.ECHO_AI_URL?.trim()
): Promise<ChefsBrainProbeResult> {
  if (!url) {
    return {
      ok: false,
      httpStatus: null,
      detail: 'ECHO_AI_URL unset — paste suggested URL on Render',
    }
  }

  const now = Date.now()
  if (
    probeCache &&
    probeCache.url === url &&
    now - probeCache.at < CACHE_TTL_MS
  ) {
    return probeCache.result
  }

  const key = process.env.ECHO_AI_KEY?.trim()
  let result: ChefsBrainProbeResult
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    const status = res.status
    if (status === 404) {
      result = {
        ok: false,
        httpStatus: status,
        detail: '404 — wrong path (expect /api/company-os/echo-brain)',
      }
    } else if (status >= 300 && status < 400) {
      result = {
        ok: false,
        httpStatus: status,
        detail: `Redirect ${status} — check ECHO_AI_URL`,
      }
    } else if (status >= 500) {
      result = {
        ok: false,
        httpStatus: status,
        detail: `Pilot error ${status}`,
      }
    } else {
      // 2xx, 401, 403, 405 — endpoint exists
      result = {
        ok: true,
        httpStatus: status,
        detail:
          status === 401 || status === 403
            ? `Reachable (${status}) — set ECHO_AI_KEY to match luccca-web ECHO_BRAIN_SECRET`
            : `Reachable (${status})`,
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'probe failed'
    result = {
      ok: false,
      httpStatus: null,
      detail: msg.includes('Timeout') || msg.includes('abort')
        ? 'Timeout — luccca-web may be asleep or unreachable'
        : `Unreachable — ${msg.slice(0, 80)}`,
    }
  }

  probeCache = { url, at: now, result }
  return result
}

export function echoAiUrlConfigured(): boolean {
  return Boolean(process.env.ECHO_AI_URL?.trim())
}

export function echoAiKeyConfigured(): boolean {
  return Boolean(process.env.ECHO_AI_KEY?.trim())
}
