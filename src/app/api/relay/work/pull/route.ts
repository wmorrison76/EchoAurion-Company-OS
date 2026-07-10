import { db } from '@/lib/db'
import { relayAuthorized, requireClientKey } from '@/lib/relay-auth'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

interface DeliveredWork {
  id: string
  title: string
  status: string
  plan: string | null
  rollbackRef: string | null
}

// Pull fallback for EXECUTED / ROLLED_BACK work results.
export async function GET(req: Request): Promise<Response> {
  const a = relayAuthorized(req)
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }
  const key = requireClientKey(new URL(req.url).searchParams.get('clientKey'))
  if (!key.ok) {
    return Response.json(
      { success: false, error: key.error, code: key.code },
      { status: key.status }
    )
  }
  try {
    const pending = await db.workRequest.findMany({
      where: {
        clientKey: key.clientKey,
        delivered: false,
        status: { in: ['EXECUTED', 'ROLLED_BACK'] },
      },
      orderBy: { updatedAt: 'asc' },
    })
    if (pending.length > 0) {
      await db.workRequest.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { delivered: true },
      })
    }
    const data: DeliveredWork[] = pending.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      plan: p.draftPlan,
      rollbackRef: p.rollbackRef,
    }))
    return Response.json({ success: true, data } satisfies APIResponse<DeliveredWork[]>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Pull failed',
        code: 'PULL_FAILED',
      },
      { status: 500 }
    )
  }
}
