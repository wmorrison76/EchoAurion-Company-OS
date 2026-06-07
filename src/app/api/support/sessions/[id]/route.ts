import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { SUPPORT_SESSION_STATUSES } from '@/types/support'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  status: z.enum(SUPPORT_SESSION_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const { id } = await params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid update payload' }, { status: 400 })
    }
    const { status, notes } = parsed.data
    const updated = await db.supportSession.update({
      where: { id },
      data: {
        ...(status ? { status, closedAt: status === 'RESOLVED' ? new Date() : null } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    })
    await audit('william_morrison', 'support.session.update', id, { status: updated.status })
    return Response.json(
      { success: true, data: { id: updated.id } } satisfies APIResponse<{ id: string }>
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Session update failed' },
      { status: 500 }
    )
  }
}
