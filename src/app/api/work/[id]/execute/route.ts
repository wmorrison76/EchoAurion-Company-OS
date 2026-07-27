import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { publishWorkStatus } from '@/lib/relay-outbox'
import { standbyMayExecuteWork } from '@/lib/standby'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  // Mandatory rollback path — revert SHA, snapshot id, or documented procedure.
  rollbackRef: z.string().min(1, 'A rollback reference is required'),
})

/**
 * Marks a change applied. Enforces all safeguards:
 *  - TWO-KEY: the customer must have authorized the quote (status AUTHORIZED)
 *    AND William is approving here.
 *  - ROLLBACK: a rollback reference is mandatory; without it, execute is refused.
 */
export async function POST(
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
      return Response.json(
        { success: false, error: 'A rollback reference is required to execute' },
        { status: 400 }
      )
    }
    const work = await db.workRequest.findUnique({ where: { id } })
    if (!work) return Response.json({ success: false, error: 'Not found' }, { status: 404 })

    // Key 1: customer authorization.
    if (work.status !== 'AUTHORIZED' || !work.approvedByCustomer) {
      return Response.json(
        { success: false, error: 'Customer has not authorized the quote yet' },
        { status: 409 }
      )
    }
    // Hard rule: Knights standby never auto-executes (compile-time false).
    if (standbyMayExecuteWork()) {
      return Response.json(
        { success: false, error: 'Standby cannot execute work', code: 'STANDBY_NO_EXECUTE' },
        { status: 403 }
      )
    }

    const executed = await db.workRequest.update({
      where: { id },
      data: {
        approvedByAdmin: true, // Key 2
        rollbackRef: parsed.data.rollbackRef,
        status: 'EXECUTED',
        executedAt: new Date(),
        actor: 'william_morrison',
      },
    })
    await audit('william_morrison', 'work.request.execute', id, {
      rollbackRef: parsed.data.rollbackRef,
      total: work.quoteTotal,
    })
    await publishWorkStatus({
      clientKey: executed.clientKey,
      workId: executed.id,
      title: executed.title,
      status: executed.status,
      plan: executed.draftPlan,
      rollbackRef: executed.rollbackRef,
    })
    await raiseAlert({
      kind: 'system',
      severity: 'INFO',
      title: `Executed: ${work.title}`,
      body: `Billed $${work.quoteTotal ?? 0}. Rollback: ${parsed.data.rollbackRef}`,
      entityRef: id,
      url: '/support',
    })
    return Response.json({ success: true, data: { id } } satisfies APIResponse<{ id: string }>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Execute failed' },
      { status: 500 }
    )
  }
}
