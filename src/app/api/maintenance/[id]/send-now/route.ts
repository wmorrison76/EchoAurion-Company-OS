import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { sendMaintenanceNotice } from '@/lib/maintenance'
import type { APIResponse } from '@/types'
import type { MaintenanceNoticeView } from '@/types/maintenance'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type RouteCtx = { params: { id: string } }

/** Immediately deliver a DRAFT or SCHEDULED notice to target pilots. */
export async function POST(_req: Request, { params }: RouteCtx): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const result = await sendMaintenanceNotice(params.id)

    await audit('william_morrison', 'maintenance.notice.send_now', params.id, {
      delivered: result.delivered,
      clientKeys: result.clientKeys,
    })

    return Response.json({
      success: true,
      data: {
        notice: result.notice,
        delivered: result.delivered,
        clientKeys: result.clientKeys,
      },
    } satisfies APIResponse<{
      notice: MaintenanceNoticeView
      delivered: number
      clientKeys: string[]
    }>)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Send failed'
    const status = msg.includes('not found') ? 404 : 400
    return Response.json({ success: false, error: msg }, { status })
  }
}
