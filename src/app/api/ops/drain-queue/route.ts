import { audit } from '@/lib/audit'
import { processIngestJobs, ingestQueueStats } from '@/lib/ingest-queue'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ops/drain-queue
 * Drain pending ingest jobs (agent_loop, notify_fanout, echo learn).
 * Auth: Bearer $CRON_SECRET
 * Prefer combining with poll-failures; this route exists for high-load bursts.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization')
  if (!secret || authz !== `Bearer ${secret}`) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401', label: '✕ Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const result = await processIngestJobs(15)
    const stats = await ingestQueueStats()
    await audit('computer_agent', 'ops.drain_queue', undefined, { ...result, stats })

    return Response.json({
      success: true,
      data: {
        ...result,
        stats,
        label:
          stats.pending > 100
            ? `⚠ Queue backlog · ${stats.pending} pending`
            : `✓ Queue drained · ${result.done} done`,
      },
    } satisfies APIResponse<{
      processed: number
      done: number
      failed: number
      stats: { pending: number; running: number; failed: number }
      label: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'drain failed',
        label: '✕ Queue drain failed',
      },
      { status: 500 }
    )
  }
}
