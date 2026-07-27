import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rollback'), reason: z.string().max(2000).optional() }),
  z.object({ action: z.literal('decline'), reason: z.string().max(2000).optional() }),
  // William comps the work — Knights may proceed after Execute (still needs rollback ref).
  z.object({ action: z.literal('approve_free'), reason: z.string().max(2000).optional() }),
])

// Admin gate for change requests:
//  - approve_free → $0, both keys set by William (no customer billing contact)
//  - decline → stop before any work
//  - rollback → reverse an EXECUTED change via the stored rollback reference
// Charge path stays: Quote → customer authorize → Execute.
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
    } else if (parsed.data.action === 'approve_free') {
      if (work.status === 'EXECUTED' || work.status === 'ROLLED_BACK') {
        return Response.json(
          { success: false, error: `Cannot approve a ${work.status} request` },
          { status: 409 }
        )
      }
      await db.workRequest.update({
        where: { id },
        data: {
          tier: work.tier ?? 'T1',
          humanHours: work.humanHours ?? 0,
          quoteTotal: 0,
          quoteSnapshot: {
            mode: 'complimentary',
            reason: parsed.data.reason ?? null,
            approvedBy: 'william_morrison',
          } as Prisma.InputJsonValue,
          approvedByCustomer: true,
          customerApprover: 'William Morrison (complimentary)',
          approvedByAdmin: true,
          status: 'AUTHORIZED',
          quotedAt: work.quotedAt ?? new Date(),
          authorizedAt: new Date(),
        },
      })
      await audit('william_morrison', 'work.request.approve_free', id, {
        reason: parsed.data.reason ?? null,
      })
      await raiseAlert({
        kind: 'system',
        severity: 'INFO',
        title: `Approved free: ${work.title}`,
        body: 'Complimentary — ready for Execute with a rollback reference.',
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
