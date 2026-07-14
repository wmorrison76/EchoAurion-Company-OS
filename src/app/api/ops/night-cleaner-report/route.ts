import { audit } from '@/lib/audit'
import {
  emptyNightCleanerReport,
  ingestNightCleanerReport,
  validateNightCleanerReport,
} from '@/lib/night-cleaner'
import type { APIResponse } from '@/types'
import type { NightCleanerIngestResult } from '@/types/night-cleaner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ops/night-cleaner-report
 * Ingest a Morning Open readiness report from the Night Cleaner Mole.
 * Creates/updates a Help Desk SYSTEM TECH task ticket — never auto-merges.
 *
 * Auth: Bearer $CRON_SECRET
 * Body: NightCleanerReport (schemaVersion: 1) — see docs/NIGHT_CLEANER_MOLE.md
 * Optional query: ?dryRun=1 — validate only, no ticket
 *
 * Suggested Render cron (pilot ships the scan; OS ingests):
 *   after close / before open → POST report JSON here
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

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'

  try {
    const raw = await req.json().catch(() => null)
    const validated = validateNightCleanerReport(raw)
    if (!validated.ok) {
      return Response.json(
        { success: false, error: validated.error, code: '400', label: '✕ Invalid report' },
        { status: 400 }
      )
    }

    if (dryRun) {
      await audit('computer_agent', 'ops.night_cleaner.dry_run', validated.report.runId, {
        score: validated.report.overall.score0to100,
        taskCount: validated.report.tasks.length,
      })
      return Response.json({
        success: true,
        data: {
          accepted: true,
          runId: validated.report.runId,
          overall: validated.report.overall,
          ticketId: null,
          ticketCreated: false,
          taskCount: validated.report.tasks.length,
          label: `? Dry run · ${validated.report.overall.shape} ${validated.report.overall.label}`,
        },
        meta: { lastUpdated: new Date().toISOString() },
      } satisfies APIResponse<NightCleanerIngestResult>)
    }

    const data = await ingestNightCleanerReport(validated.report, { createTicket: true })
    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<NightCleanerIngestResult>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Night cleaner ingest failed',
        label: '✕ Ingest failed',
      },
      { status: 500 }
    )
  }
}

export async function GET(): Promise<Response> {
  const example = emptyNightCleanerReport({
    runId: 'example-run',
    repo: 'wmorrison76/Echo_Aurion-LUCCCA_Framework',
    productLine: 'echoaurion',
    source: 'cron',
    environment: 'staging',
  })

  return Response.json({
    success: true,
    data: {
      endpoint: '/api/ops/night-cleaner-report',
      auth: 'Bearer CRON_SECRET',
      docs: 'docs/NIGHT_CLEANER_MOLE.md',
      schemaVersion: 1,
      labels: { ok: '✓ Ready for morning open', warn: '▲ Needs day-shift attention', error: '✕ Blocks morning open' },
      policy: 'TASK tickets only — morning-open task list; no silent merges, no overnight remodel',
      systemImprovements: 'optional string[] — plain-English improvements (slow panels, Coming soon, stubs)',
      exampleMinimal: example,
    },
  })
}
