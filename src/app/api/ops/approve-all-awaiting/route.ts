import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { approveAllAwaitingApproval } from '@/lib/help-desk-approve'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type BulkApproveResult = Awaited<ReturnType<typeof approveAllAwaitingApproval>>

/**
 * Bulk-approve every AWAITING_APPROVAL ticket with a knight draft.
 *
 * Auth: admin session OR Authorization: Bearer $CRON_SECRET
 *
 * Example (Render shell / cron):
 *   curl -X POST "$WEB_SERVICE_URL/api/ops/approve-all-awaiting" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Dry run:
 *   curl -X POST "...?dryRun=1" -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization')
  const cronOk = Boolean(secret && authz === `Bearer ${secret}`)

  if (!cronOk) {
    const session = await auth()
    if (!session?.user) {
      return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
    }
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dryRun') === 'true'

  try {
    const result = await approveAllAwaitingApproval({
      actor: cronOk ? 'computer_agent' : 'william_morrison',
      dryRun,
    })

    await audit(
      cronOk ? 'computer_agent' : 'william_morrison',
      'help_desk.ticket.approve_all',
      undefined,
      {
        dryRun,
        approved: result.approved,
        skipped: result.skipped,
        failed: result.failed,
      }
    )

    return Response.json({
      success: true,
      data: result,
    } satisfies APIResponse<BulkApproveResult>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Bulk approve failed',
      },
      { status: 500 }
    )
  }
}
