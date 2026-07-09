// Public, unauthenticated health check used by Render (CLAUDE.md §20.2).
// Reports process liveness always; DB reachability when DATABASE_URL is set.
export const dynamic = 'force-dynamic'

export async function GET() {
  const timestamp = new Date().toISOString()
  let database: 'ok' | 'skipped' | 'error' = 'skipped'
  if (process.env.DATABASE_URL) {
    try {
      const { db } = await import('@/lib/db')
      await db.$queryRaw`SELECT 1`
      database = 'ok'
    } catch {
      database = 'error'
      return Response.json({ status: 'degraded', database, timestamp }, { status: 503 })
    }
  }
  return Response.json({ status: 'ok', database, timestamp })
}
