import { audit } from '@/lib/audit'
import { dispatchDueMaintenanceNotices } from '@/lib/maintenance'
import type { APIResponse } from '@/types'
import { verifyCronBearer } from '@/lib/verify-bearer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type DispatchResult = {
  sent: string[]
  errors: Array<{ id: string; error: string }>
}

/**
 * Cron-friendly dispatcher: sends all SCHEDULED notices with scheduledFor <= now.
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * Example:
 *   curl -X POST "$WEB_SERVICE_URL/api/maintenance/dispatch" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: Request): Promise<Response> {
    if (!verifyCronBearer(req)) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const result = await dispatchDueMaintenanceNotices()

    await audit('computer_agent', 'maintenance.dispatch', undefined, {
      sentCount: result.sent.length,
      errorCount: result.errors.length,
      sent: result.sent,
    })

    return Response.json({
      success: true,
      data: result,
    } satisfies APIResponse<DispatchResult>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Dispatch failed' },
      { status: 500 }
    )
  }
}
