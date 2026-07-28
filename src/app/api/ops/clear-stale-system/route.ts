import { auth } from '@/lib/auth'
import { clearStaleSystemTickets } from '@/lib/clear-stale-system'
import { verifyCronBearer } from '@/lib/verify-bearer'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Bulk-resolve stuck SYSTEM Help Desk tickets (OPEN / AWAITING / WITH_KNIGHTS).
 * Auth: admin session OR Authorization: Bearer $CRON_SECRET
 *
 * Optional query: ?olderThanHours=1&limit=100
 */
export async function POST(req: Request): Promise<Response> {
  const cronOk = verifyCronBearer(req)

  if (!cronOk) {
    const session = await auth()
    if (!session?.user) {
      return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
    }
  }

  const url = new URL(req.url)
  const olderRaw = url.searchParams.get('olderThanHours')
  const limitRaw = url.searchParams.get('limit')
  const olderThanHours = olderRaw != null ? Number(olderRaw) : 0
  const limit = limitRaw != null ? Number(limitRaw) : 100

  try {
    const result = await clearStaleSystemTickets({
      actor: cronOk ? 'computer_agent' : 'william_morrison',
      olderThanHours: Number.isFinite(olderThanHours) ? olderThanHours : 0,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100,
    })

    return Response.json({
      success: true,
      data: result,
    } satisfies APIResponse<typeof result>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Clear stale SYSTEM failed',
      },
      { status: 500 }
    )
  }
}
