// Public, unauthenticated DEEP health check — verifies database reachability.
//
// This is deliberately NOT the Render healthCheckPath. Render probes its
// health path continuously, and a database round-trip on every probe pins the
// Neon compute awake 24/7 (the cause of ~$170/mo of Neon compute in Aug 2026)
// while also turning a routine Neon cold start into a false outage.
//
// Call this from monitoring on an interval (>= 15 minutes recommended, which
// is longer than Neon's 5-minute suspend timeout, so the compute can still
// scale to zero between checks).
//
// Contract:
//   200 { status: 'ok',       database: 'ok' }
//   503 { status: 'degraded', database: 'error' | 'unconfigured' }
export const dynamic = 'force-dynamic'

export async function GET() {
  const timestamp = new Date().toISOString()

  if (!process.env.DATABASE_URL) {
    return Response.json(
      { status: 'degraded', database: 'unconfigured', timestamp },
      { status: 503 }
    )
  }

  const startedAt = Date.now()
  try {
    const { db } = await import('@/lib/db')
    await db.$queryRaw`SELECT 1`
    return Response.json({
      status: 'ok',
      database: 'ok',
      latencyMs: Date.now() - startedAt,
      timestamp,
    })
  } catch {
    // Never echo the driver error — connection strings surface in pg messages.
    return Response.json(
      { status: 'degraded', database: 'error', latencyMs: Date.now() - startedAt, timestamp },
      { status: 503 }
    )
  }
}
