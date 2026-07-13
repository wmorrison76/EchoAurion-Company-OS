import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ingestQueueStats } from '@/lib/ingest-queue'
import type { APIResponse } from '@/types'
import type { StatusLevel } from '@/types'
import type { DrainHealthSnapshot } from '@/types/drain-health'

export const dynamic = 'force-dynamic'

export type { DrainHealthSnapshot }

/**
 * GET /api/dr-os/drain-health
 * Compact dead-letter / ingest-drain health for Dr. OS chip.
 * Counts only — no job payloads / PII.
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const stuckCutoff = new Date(Date.now() - 5 * 60_000)

    const [stats, stuckOutbox, lastPoll, lastDrain] = await Promise.all([
      ingestQueueStats(),
      db.relayOutbox.count({
        where: { deliveredAt: null, createdAt: { lt: stuckCutoff } },
      }),
      db.auditLog.findFirst({
        where: { action: 'ops.poll_failures' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      db.auditLog.findFirst({
        where: { action: { in: ['ops.drain_queue', 'ops.poll_failures'] } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])

    const lastDrainAt = lastDrain?.createdAt ?? null
    const minutesSinceLastDrain = lastDrainAt
      ? Math.round((Date.now() - lastDrainAt.getTime()) / 60_000)
      : null

    // ops-poll is every 5 min — stale if no poll/drain in 20+ minutes
    const stale = minutesSinceLastDrain == null || minutesSinceLastDrain > 20
    const backlog = stats.pending > 50 || stats.failed > 0 || stuckOutbox > 0

    let level: StatusLevel = 'ok'
    let shape = '✓'
    let label = 'Drain healthy'
    if (stats.failed > 0 || stuckOutbox > 5) {
      level = 'error'
      shape = '✕'
      label = 'Dead-letter backlog'
    } else if (stale) {
      level = 'warn'
      shape = '⚠'
      label = minutesSinceLastDrain == null ? 'Drain never ran' : 'Drain cron stale'
    } else if (backlog) {
      level = 'warn'
      shape = '⚠'
      label = 'Queue backlog'
    }

    const data: DrainHealthSnapshot = {
      pending: stats.pending,
      running: stats.running,
      failed: stats.failed,
      stuckOutbox,
      lastPollAt: lastPoll?.createdAt.toISOString() ?? null,
      lastDrainAt: lastDrainAt?.toISOString() ?? null,
      minutesSinceLastDrain,
      level,
      shape,
      label,
    }

    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<DrainHealthSnapshot>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Drain health failed',
      },
      { status: 500 }
    )
  }
}
