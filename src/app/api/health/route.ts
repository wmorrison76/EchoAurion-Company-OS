// Public, unauthenticated health check used by Render (CLAUDE.md §20.2).
// Reports process liveness always; DB reachability when DATABASE_URL is set.
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

  let database: 'ok' | 'skipped' | 'error' = 'skipped'
  if (process.env.DATABASE_URL) {
    try {
      const { db } = await import('@/lib/db')
      await db.$queryRaw`SELECT 1`
      database = 'ok'
    } catch {
      database = 'error'
      return Response.json(
        { status: 'degraded', database, emailConfigured, redisFanout, timestamp },
        { status: 503 }
      )
    }
  }
  return Response.json({ status: 'ok', database, emailConfigured, redisFanout, timestamp })
}
