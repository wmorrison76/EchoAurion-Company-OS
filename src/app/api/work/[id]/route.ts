import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rollback'), reason: z.string().max(2000).optional() }),
  z.object({ action: z.literal('decline'), reason: z.string().max(2000).optional() }),
])

// Rollback (only from EXECUTED — uses the mandatory rollback reference) or
// decline a request before work begins.
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
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid action' }, { status: 400 })
    }
    const work = await db.workRequest.findUnique({ where: { id } })
    if (!work) return Response.json({ success: false, error: 'Not found' }, { status: 404 })

    if (parsed.data.action === 'rollback') {
      if (work.status !== 'EXECUTED') {
        return Response.json(
          { success: false, error: 'Only an executed change can be rolled back' },
          { status: 409 }
        )
      }
      if (!work.rollbackRef) {
        return Response.json(
          { success: false, error: 'No rollback reference on record' },
          { status: 409 }
        )
      }
      await db.workRequest.update({
        where: { id },
        data: { status: 'ROLLED_BACK', rolledBackAt: new Date(), delivered: false },
      })
      await audit('william_morrison', 'work.request.rollback', id, { ref: work.rollbackRef })
      await raiseAlert({
        kind: 'system',
        severity: 'WARN',
        title: `Rolled back: ${work.title}`,
        body: `Reverted via ${work.rollbackRef}.`,
        entityRef: id,
        url: '/support',
      })
    } else {
      if (work.status === 'EXECUTED') {
        return Response.json(
          { success: false, error: 'Cannot decline an executed request — roll it back instead' },
          { status: 409 }
        )
      }
      await db.workRequest.update({ where: { id }, data: { status: 'DECLINED' } })
      await audit('william_morrison', 'work.request.decline', id)
    }
    return Response.json({ success: true, data: { id } } satisfies APIResponse<{ id: string }>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    )
  }
}
