import { audit } from '@/lib/audit'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import {
  pollGithubCiFailures,
  pollRailwayDeployFailures,
  pollRenderDeployFailures,
  pollRenderRuntimeFailures,
} from '@/lib/ops-failure-ingest'
import { processIngestJobs } from '@/lib/ingest-queue'
import { purgeExpiredNonces } from '@/lib/request-handshake'
import type { APIResponse } from '@/types'
import { verifyCronBearer } from '@/lib/verify-bearer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type PollResult = {
  render: { checked: number; ingested: number; ticketIds: string[] }
  renderRuntime: { checked: number; ingested: number; ticketIds: string[] }
  github: { checked: number; ingested: number; ticketIds: string[] }
  railway: {
    checked: number
    ingested: number
    ticketIds: string[]
    skipped: boolean
    reason?: string
  }
  queue: { processed: number; done: number; failed: number }
  label: string
}

/**
 * POST /api/ops/poll-failures
 * Cron: poll Render failed deploys + GitHub CI failures → SYSTEM tickets,
 * then drain a batch of ingest jobs (agent loop / notify / learning).
 * Railway: scaffold poll (skipped unless RAILWAY_TOKEN + project wired) —
 * honest: only Render + GitHub are live today.
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function POST(req: Request): Promise<Response> {
    if (!verifyCronBearer(req)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401', label: '✕ Unauthorized' },
      { status: 401 }
    )
  }

  const throttle = allowIngestThrottle({ scope: 'ops_poll' })
  if (!throttle.ok) return throttleResponse(throttle)

  try {
    const [render, renderRuntime, github, railway] = await Promise.all([
      pollRenderDeployFailures(),
      pollRenderRuntimeFailures(),
      pollGithubCiFailures(),
      pollRailwayDeployFailures(),
    ])
    const queue = await processIngestJobs(10)
    const noncesPurged = await purgeExpiredNonces()

    const ingested =
      render.ingested + renderRuntime.ingested + github.ingested + railway.ingested
    const label =
      ingested > 0
        ? `⚠ Ops failures captured · ${ingested} ticket(s)`
        : '✓ Ops poll healthy · no new failures'

    await audit('computer_agent', 'ops.poll_failures', undefined, {
      render,
      renderRuntime,
      github,
      railway,
      queue,
      noncesPurged,
    })

    return Response.json({
      success: true,
      data: {
        render,
        renderRuntime,
        github,
        railway,
        queue,
        noncesPurged,
        label,
      } satisfies PollResult & {
        noncesPurged: number
      },
    } satisfies APIResponse<PollResult & { noncesPurged: number }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'poll failed',
        label: '✕ Ops poll failed',
      },
      { status: 500 }
    )
  }
}
