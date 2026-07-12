import { audit } from '@/lib/audit'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import { pollGithubCiFailures, pollRenderDeployFailures } from '@/lib/ops-failure-ingest'
import { processIngestJobs } from '@/lib/ingest-queue'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type PollResult = {
  render: { checked: number; ingested: number; ticketIds: string[] }
  github: { checked: number; ingested: number; ticketIds: string[] }
  queue: { processed: number; done: number; failed: number }
  label: string
}

/**
 * POST /api/ops/poll-failures
 * Cron: poll Render failed deploys + GitHub CI failures → SYSTEM tickets,
 * then drain a batch of ingest jobs (agent loop / notify / learning).
 *
 * Auth: Authorization: Bearer $CRON_SECRET
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

  const throttle = allowIngestThrottle({ scope: 'ops_poll' })
  if (!throttle.ok) return throttleResponse(throttle)

  try {
    const [render, github] = await Promise.all([
      pollRenderDeployFailures(),
      pollGithubCiFailures(),
    ])
    const queue = await processIngestJobs(10)

    const ingested = render.ingested + github.ingested
    const label =
      ingested > 0
        ? `⚠ Ops failures captured · ${ingested} ticket(s)`
        : '✓ Ops poll healthy · no new failures'

    await audit('computer_agent', 'ops.poll_failures', undefined, {
      render,
      github,
      queue,
    })

    return Response.json({
      success: true,
      data: { render, github, queue, label } satisfies PollResult,
    } satisfies APIResponse<PollResult>)
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
