import { db } from '@/lib/db'
import { relayAuthorized } from '@/lib/relay-auth'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

interface DeliverableAnswer {
  id: string
  question: string
  answer: string | null
  directive: unknown
}

// A deployment polls for approved answers addressed to it. Returns ANSWERED &
// undelivered items and marks them delivered so they are handed over exactly
// once. This is the only outbound channel — William's approval is the gate.
export async function GET(req: Request): Promise<Response> {
  const a = relayAuthorized(req)
  if (!a.ok) return Response.json({ success: false, error: a.error }, { status: a.status })
  const clientKey = new URL(req.url).searchParams.get('clientKey')
  if (!clientKey) {
    return Response.json({ success: false, error: 'clientKey required' }, { status: 400 })
  }
  try {
    const pending = await db.customerQuestion.findMany({
      where: { clientKey, status: 'ANSWERED', delivered: false },
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
      { success: false, error: error instanceof Error ? error.message : 'Pull failed' },
      { status: 500 }
    )
  }
}
