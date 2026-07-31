import { auth } from '@/lib/auth'
import { buildDeskMolesReport } from '@/lib/desk-moles/run'
import { ingestNightCleanerReport } from '@/lib/night-cleaner'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'
import type { NightCleanerIngestResult, NightCleanerReport } from '@/types/night-cleaner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization')
  if (secret && authz === `Bearer ${secret}`) return true
  return false
}

/**
 * POST /api/ops/desk-moles-run
 * Run three single-duty desk moles (workflow / UX / i18n) and optionally
 * file a Night Cleaner Help Desk TASK ticket for William to decide.
 *
 * Auth: session (Dr. OS) OR Bearer CRON_SECRET
 * Query: ?dryRun=1 — return report only, no ticket
 *        ?ticket=0 — skip ticket even when not dry-run (preview)
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  const cronOk = authorized(req)
  if (!session?.user && !cronOk) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401' },
      { status: 401 }
    )
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const wantTicket = url.searchParams.get('ticket') !== '0' && !dryRun

  try {
    const report: NightCleanerReport = buildDeskMolesReport({
      environment:
        process.env.NODE_ENV === 'production' ? 'production' : 'local',
      gitSha: process.env.RENDER_GIT_COMMIT?.slice(0, 7),
    })

    if (dryRun || !wantTicket) {
      await audit(
        session?.user ? 'william_morrison' : 'computer_agent',
        'ops.desk_moles.dry_run',
        report.runId,
        {
          score: report.overall.score0to100,
          taskCount: report.tasks.length,
          categories: report.categories.map((c) => c.id),
        }
      )
      return Response.json({
        success: true,
        data: {
          report,
          ingest: null,
          label: `? Desk moles dry-run · ${report.overall.shape} ${report.overall.label} · ${report.tasks.length} tasks`,
        },
      } satisfies APIResponse<{
        report: NightCleanerReport
        ingest: NightCleanerIngestResult | null
        label: string
      }>)
    }

    const ingest = await ingestNightCleanerReport(report, { createTicket: true })
    await audit(
      session?.user ? 'william_morrison' : 'computer_agent',
      'ops.desk_moles.run',
      ingest.ticketId ?? report.runId,
      {
        score: report.overall.score0to100,
        taskCount: report.tasks.length,
        ticketId: ingest.ticketId,
      }
    )

    return Response.json({
      success: true,
      data: {
        report,
        ingest,
        label: ingest.label,
      },
    } satisfies APIResponse<{
      report: NightCleanerReport
      ingest: NightCleanerIngestResult
      label: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Desk moles failed',
      },
      { status: 500 }
    )
  }
}

/** GET — same as dry-run for quick Dr. OS peek. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  url.searchParams.set('dryRun', '1')
  return POST(new Request(url, { method: 'POST', headers: req.headers }))
}
