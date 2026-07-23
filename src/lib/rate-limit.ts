/**
 * In-memory sliding-window rate limit (per Render instance).
 * Shared by forgot-password, relay ingest, CI/deploy, knowledge paths.
 * Designed for ~5k-tenant bursts — see docs/SCALE_AND_THROTTLE.md.
 * Multi-instance: upgrade to Redis/Upstash (documented, not blocking).
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** Hot-path budgets (per process). Env overrides optional. */
export const INGEST_BUDGETS = {
  /** Per clientKey error-events / minute */
  errorPerClient: Number(process.env.RATE_ERROR_PER_CLIENT ?? 30),
  /** Global error-events / minute (all clients) */
  errorGlobal: Number(process.env.RATE_ERROR_GLOBAL ?? 400),
  /** Self-report / minute (admin UI) */
  selfReport: Number(process.env.RATE_SELF_REPORT ?? 20),
  /** Knowledge ingest / minute per clientKey */
  knowledgePerClient: Number(process.env.RATE_KNOWLEDGE_PER_CLIENT ?? 60),
  /** Knowledge ingest global / minute */
  knowledgeGlobal: Number(process.env.RATE_KNOWLEDGE_GLOBAL ?? 200),
  /** GitHub webhook events / minute */
  githubWebhook: Number(process.env.RATE_GITHUB_WEBHOOK ?? 120),
  /** Railway webhook events / minute (scaffold) */
  railwayWebhook: Number(process.env.RATE_RAILWAY_WEBHOOK ?? 60),
  /** Render webhook events / minute */
  renderWebhook: Number(process.env.RATE_RENDER_WEBHOOK ?? 60),
  /** Ops poll / minute (cron) */
  opsPoll: Number(process.env.RATE_OPS_POLL ?? 6),
} as const

const WINDOW_MS = 60_000

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
  if (buckets.size > 8000) {
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

export type ThrottleResult =
  | { ok: true }
  | {
      ok: false
      retryAfterSec: number
      code: 'RATE_LIMITED'
      /** Colorblind-safe label for pilots / operators */
      label: string
    }

/** Dual budget: per-clientKey + global. Both must pass. */
export function allowIngestThrottle(input: {
  scope:
    | 'error'
    | 'knowledge'
    | 'self_report'
    | 'github_webhook'
    | 'railway_webhook'
    | 'render_webhook'
    | 'ops_poll'
  clientKey?: string | null
}): ThrottleResult {
  if (input.scope === 'error') {
    const global = allowRateLimit('ingest:error:global', INGEST_BUDGETS.errorGlobal, WINDOW_MS)
    if (!global.ok) {
      return {
        ok: false,
        retryAfterSec: global.retryAfterSec,
        code: 'RATE_LIMITED',
        label: '⚠ Throttled — global error budget',
      }
    }
    if (input.clientKey) {
      const per = allowRateLimit(
        `ingest:error:ck:${input.clientKey}`,
        INGEST_BUDGETS.errorPerClient,
        WINDOW_MS
      )
      if (!per.ok) {
        return {
          ok: false,
          retryAfterSec: per.retryAfterSec,
          code: 'RATE_LIMITED',
          label: '⚠ Throttled — client error budget',
        }
      }
    }
    return { ok: true }
  }

  if (input.scope === 'knowledge') {
    const global = allowRateLimit(
      'ingest:knowledge:global',
      INGEST_BUDGETS.knowledgeGlobal,
      WINDOW_MS
    )
    if (!global.ok) {
      return {
        ok: false,
        retryAfterSec: global.retryAfterSec,
        code: 'RATE_LIMITED',
        label: '⚠ Throttled — global knowledge budget',
      }
    }
    if (input.clientKey) {
      const per = allowRateLimit(
        `ingest:knowledge:ck:${input.clientKey}`,
        INGEST_BUDGETS.knowledgePerClient,
        WINDOW_MS
      )
      if (!per.ok) {
        return {
          ok: false,
          retryAfterSec: per.retryAfterSec,
          code: 'RATE_LIMITED',
          label: '⚠ Throttled — client knowledge budget',
        }
      }
    }
    return { ok: true }
  }

  if (input.scope === 'self_report') {
    const r = allowRateLimit('ingest:self_report', INGEST_BUDGETS.selfReport, WINDOW_MS)
    if (!r.ok) {
      return {
        ok: false,
        retryAfterSec: r.retryAfterSec,
        code: 'RATE_LIMITED',
        label: '⚠ Throttled — self-report budget',
      }
    }
    return { ok: true }
  }

  if (input.scope === 'github_webhook') {
    const r = allowRateLimit('ingest:github_webhook', INGEST_BUDGETS.githubWebhook, WINDOW_MS)
    if (!r.ok) {
      return {
        ok: false,
        retryAfterSec: r.retryAfterSec,
        code: 'RATE_LIMITED',
        label: '⚠ Throttled — GitHub webhook budget',
      }
    }
    return { ok: true }
  }

  if (input.scope === 'railway_webhook') {
    const r = allowRateLimit('ingest:railway_webhook', INGEST_BUDGETS.railwayWebhook, WINDOW_MS)
    if (!r.ok) {
      return {
        ok: false,
        retryAfterSec: r.retryAfterSec,
        code: 'RATE_LIMITED',
        label: '⚠ Throttled — Railway webhook budget',
      }
    }
    return { ok: true }
  }

  if (input.scope === 'render_webhook') {
    const r = allowRateLimit('ingest:render_webhook', INGEST_BUDGETS.renderWebhook, WINDOW_MS)
    if (!r.ok) {
      return {
        ok: false,
        retryAfterSec: r.retryAfterSec,
        code: 'RATE_LIMITED',
        label: '⚠ Throttled — Render webhook budget',
      }
    }
    return { ok: true }
  }

  const r = allowRateLimit('ingest:ops_poll', INGEST_BUDGETS.opsPoll, WINDOW_MS)
  if (!r.ok) {
    return {
      ok: false,
      retryAfterSec: r.retryAfterSec,
      code: 'RATE_LIMITED',
      label: '⚠ Throttled — ops poll budget',
    }
  }
  return { ok: true }
}

export function throttleResponse(t: Extract<ThrottleResult, { ok: false }>): Response {
  return Response.json(
    {
      success: false,
      error: t.label,
      code: t.code,
      label: t.label,
      retryAfterSec: t.retryAfterSec,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(t.retryAfterSec) },
    }
  )
}
