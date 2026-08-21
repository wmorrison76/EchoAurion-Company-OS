import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { getRuntimeIdentity } from '@/lib/runtime-identity'
import { ingestNightCleanerReport } from '@/lib/night-cleaner'
import {
  buildStubScanReport,
  formatStubScanCli,
  scanCompanyOsSrc,
} from '@/lib/stub-scanner'
import { verifyCronBearer } from '@/lib/verify-bearer'
import type { APIResponse } from '@/types'
import type { NightCleanerIngestResult, NightCleanerReport } from '@/types/night-cleaner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ops/stub-scan
 * Walk src/ for dead-end strings / known scaffolds and optionally file a
 * SYSTEM TECH ticket with file paths (deduped once per UTC day).
 *
 * Auth: session (Dr. OS) OR Bearer CRON_SECRET
 * Query: ?dryRun=1 — report only, no ticket
 *        ?ticket=0 — skip ticket
 *
 * Daily hook: echoaurion-company-os-desk-moles already includes this scan
 * in the morning-open ticket. This route is on-demand / CLI ingest.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  const cronOk = verifyCronBearer(req)
  if (!session?.user && !cronOk) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401', label: '✕ Unauthorized' },
      { status: 401 }
    )
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const wantTicket = url.searchParams.get('ticket') !== '0' && !dryRun
  const identity = getRuntimeIdentity()

  try {
    const report: NightCleanerReport = buildStubScanReport({
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'local',
      gitSha: identity.commit ?? undefined,
    })
    const scan = scanCompanyOsSrc()

    if (dryRun || !wantTicket) {
      await audit(
        session?.user ? 'william_morrison' : 'computer_agent',
        'ops.stub_scan.dry_run',
        report.runId,
        {
          filesScanned: scan.filesScanned,
          hitCount: scan.hits.length,
          skipped: scan.skipped,
        }
      )
      return Response.json({
        success: true,
        data: {
          report,
          ingest: null,
          label: `? Stub scan dry-run · ${report.overall.shape} ${report.overall.label} · ${scan.hits.length} path(s)`,
          cli: formatStubScanCli(scan),
        },
        meta: { lastUpdated: new Date().toISOString() },
      } satisfies APIResponse<{
        report: NightCleanerReport
        ingest: NightCleanerIngestResult | null
        label: string
        cli: string
      }>)
    }

    const ingest = await ingestNightCleanerReport(report, {
      createTicket: true,
      fingerprintKind: 'stub-scan',
    })
    await audit(
      session?.user ? 'william_morrison' : 'computer_agent',
      'ops.stub_scan.run',
      ingest.ticketId ?? report.runId,
      {
        filesScanned: scan.filesScanned,
        hitCount: scan.hits.length,
        ticketId: ingest.ticketId,
        ticketCreated: ingest.ticketCreated,
      }
    )

    return Response.json({
      success: true,
      data: {
        report,
        ingest,
        label: ingest.label,
        cli: formatStubScanCli(scan),
      },
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<{
      report: NightCleanerReport
      ingest: NightCleanerIngestResult
      label: string
      cli: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Stub scan failed',
        label: '✕ Stub scan failed',
      },
      { status: 500 }
    )
  }
}

/** GET — dry-run peek (session or CRON_SECRET). */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  url.searchParams.set('dryRun', '1')
  return POST(new Request(url, { method: 'POST', headers: req.headers }))
}
