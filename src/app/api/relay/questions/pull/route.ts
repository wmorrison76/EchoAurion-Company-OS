import { db } from '@/lib/db'
import { relayAuthorized, requireClientKey } from '@/lib/relay-auth'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

interface DeliverableAnswer {
  id: string
  question: string
  answer: string | null
  directive: unknown
}

// Pull fallback — SSE is preferred. Returns ANSWERED & undelivered once.
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
    const pending = await db.customerQuestion.findMany({
      where: { clientKey: key.clientKey, status: 'ANSWERED', delivered: false },
      orderBy: { answeredAt: 'asc' },
    })
    if (pending.length > 0) {
      await db.customerQuestion.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { delivered: true },
      })
    }
    const data: DeliverableAnswer[] = pending.map((p) => ({
      id: p.id,
      question: p.question,
      answer: p.answer,
      directive: p.directive,
    }))
    return Response.json({ success: true, data } satisfies APIResponse<DeliverableAnswer[]>)
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
