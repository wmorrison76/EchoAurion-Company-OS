import { audit } from '@/lib/audit'
import { processKnightJobs, ingestQueueStats } from '@/lib/ingest-queue'
import { knightConcurrencyStats } from '@/lib/knight-concurrency'
import type { APIResponse } from '@/types'
import { verifyCronBearer } from '@/lib/verify-bearer'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/ops/drain-knight-queue
 * Drain pending text_knights ingest jobs (Help Desk relay path).
 * Auth: Bearer $CRON_SECRET
 *
 * Dedicated worker — runs every 1 minute via echoaurion-company-os-knight-drain cron.
 */
export async function POST(req: Request): Promise<Response> {
  if (!verifyCronBearer(req)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401', label: '✕ Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const batch = Number(process.env.KNIGHT_WORKER_BATCH ?? 5)
    const result = await processKnightJobs(batch)
    const stats = await ingestQueueStats()
    const concurrency = knightConcurrencyStats()
    await audit('computer_agent', 'ops.drain_knight_queue', undefined, {
      ...result,
      stats,
      concurrency,
    })

    return Response.json({
      success: true,
      data: {
        ...result,
        stats,
        concurrency,
        label:
          stats.knightPending > 50
            ? `⚠ Knight backlog · ${stats.knightPending} pending`
            : `✓ Knight drain · ${result.done} done · ${stats.knightPending} pending`,
      },
    } satisfies APIResponse<{
      processed: number
      done: number
      failed: number
      stats: {
        pending: number
        running: number
        failed: number
        knightPending: number
      }
      concurrency: { active: number; max: number }
      label: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'knight drain failed',
        label: '✕ Knight queue drain failed',
      },
      { status: 500 }
    )
  }
}
