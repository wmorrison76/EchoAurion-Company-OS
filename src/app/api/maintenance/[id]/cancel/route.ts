import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { toMaintenanceView } from '@/lib/maintenance'
import type { APIResponse } from '@/types'
import type { MaintenanceNoticeView } from '@/types/maintenance'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: { id: string } }

/** Cancel a SCHEDULED notice (future only). */
export async function POST(_req: Request, { params }: RouteCtx): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const existing = await db.maintenanceNotice.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    if (existing.status !== 'SCHEDULED' && existing.status !== 'DRAFT') {
      return Response.json(
        { success: false, error: `Cannot cancel a ${existing.status.toLowerCase()} notice` },
        { status: 400 }
      )
    }

    const updated = await db.maintenanceNotice.update({
      where: { id: params.id },
      data: { status: 'CANCELLED', scheduledFor: null },
    })

    await audit('william_morrison', 'maintenance.notice.cancel', updated.id)

    return Response.json({
      success: true,
      data: toMaintenanceView(updated),
    } satisfies APIResponse<MaintenanceNoticeView>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Cancel failed' },
      { status: 500 }
    )
  }
}
