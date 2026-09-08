// Public, unauthenticated LIVENESS check used by Render (CLAUDE.md §20.2).
// Deliberately does NOT touch the database. Render probes this path
// continuously; a `SELECT 1` here kept the Neon compute permanently awake
// (767 CU-hours in Aug 2026) and made a Neon cold start look like an
// application outage — the probe would 503 and Render would cycle the service.
// Database reachability now lives at /api/health/deep, which monitoring calls
// on an interval instead of on every probe.
// emailConfigured is a boolean only — never exposes keys or EMAIL_FROM.
// redisFanout is informational — Upstash is optional; never fails health when unset.
export const dynamic = 'force-dynamic'

function redisFanoutMode(): 'configured' | 'memory-only' {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  return url && token ? 'configured' : 'memory-only'
}

export async function GET() {
  const timestamp = new Date().toISOString()
  const { isEmailConfigured } = await import('@/lib/email')
  const emailConfigured = isEmailConfigured()
  const redisFanout = redisFanoutMode()

  // `database: 'not-checked'` is intentional and stable: it tells any reader
  // that this endpoint makes no claim about the database, rather than implying
  // the database is absent. Use /api/health/deep for a real answer.
  return Response.json({
    status: 'ok',
    database: 'not-checked',
    emailConfigured,
    redisFanout,
    timestamp,
  })
}
