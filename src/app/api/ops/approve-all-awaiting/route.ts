import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { approveAllAwaitingApproval } from '@/lib/help-desk-approve'
import type { APIResponse } from '@/types'
import { verifyCronBearer } from '@/lib/verify-bearer'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type BulkApproveResult = Awaited<ReturnType<typeof approveAllAwaitingApproval>>

/**
 * Bulk approval requires an authenticated DrOS administrator session.
 * Scheduler bearer tokens can request dry-run summaries ONLY.
 *
 * CRON_SECRET is an automation credential, never approval authority.
 * An explicit dryRun=1 may return a preview without approving/sending.
 */
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const dryRun = ['1', 'true'].includes((url.searchParams.get('dryRun') ?? '').toLowerCase())
  const cronOk = verifyCronBearer(req)
  const session = cronOk ? null : await auth()
  const adminOk = session?.user?.role === 'dr_os' && session.user.id === 'william_morrison'

  if (!adminOk && !cronOk) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  if (cronOk && !dryRun) {
    return Response.json({
      success: false,
      error: 'Scheduler cannot approve or send replies; administrator session required',
      code: 'ADMIN_APPROVAL_REQUIRED',
    }, { status: 403 })
  }
  const actor = adminOk ? 'william_morrison' : 'computer_agent'

  try {
    const result = await approveAllAwaitingApproval({
      actor,
      dryRun,
    })

    await audit(
      actor,
      'help_desk.ticket.approve_all',
      undefined,
      {
        dryRun,
        approved: result.approved,
        wouldApprove: result.wouldApprove,
        skipped: result.skipped,
        failed: result.failed,
      }
    )

    // Scheduler credentials are not entitled to ticket identifiers or subjects.
    const data = cronOk ? {
      approved: result.approved,
      wouldApprove: result.wouldApprove,
      skipped: result.skipped,
      failed: result.failed,
    } : result
    return Response.json({
      success: true,
      data,
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: 'Bulk approve failed',
      },
      { status: 500 }
    )
  }
}
