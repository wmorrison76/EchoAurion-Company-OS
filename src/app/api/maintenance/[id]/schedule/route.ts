import { z } from 'zod'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { toMaintenanceView } from '@/lib/maintenance'
import type { APIResponse } from '@/types'
import type { MaintenanceNoticeView } from '@/types/maintenance'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  scheduledFor: z.string().datetime(),
})

type RouteCtx = { params: { id: string } }

/** Mark a DRAFT (or re-schedule a SCHEDULED) notice for future dispatch. */
export async function POST(req: Request, { params }: RouteCtx): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const existing = await db.maintenanceNotice.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
      return Response.json(
        { success: false, error: `Cannot schedule a ${existing.status.toLowerCase()} notice` },
        { status: 400 }
      )
    }

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'scheduledFor must be an ISO datetime' },
        { status: 400 }
      )
    }

    const when = new Date(parsed.data.scheduledFor)
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() - 60_000) {
      return Response.json(
        { success: false, error: 'scheduledFor must be in the future' },
        { status: 400 }
      )
    }

    const updated = await db.maintenanceNotice.update({
      where: { id: params.id },
      data: { status: 'SCHEDULED', scheduledFor: when },
    })

    await audit('william_morrison', 'maintenance.notice.schedule', updated.id, {
      scheduledFor: when.toISOString(),
    })

    return Response.json({
      success: true,
      data: toMaintenanceView(updated),
    } satisfies APIResponse<MaintenanceNoticeView>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Schedule failed' },
      { status: 500 }
    )
  }
}
