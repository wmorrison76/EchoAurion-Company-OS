import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'
import type { CustomerQuestionView, QuestionStatus } from '@/types/support'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const questions = await db.customerQuestion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    // Resolve client labels in one pass.
    const clientIds = [...new Set(questions.map((q) => q.clientId).filter(Boolean))] as string[]
    const clients = clientIds.length
      ? await db.supportClient.findMany({ where: { id: { in: clientIds } }, select: { id: true, label: true } })
      : []
    const labelById = new Map(clients.map((c) => [c.id, c.label]))

    const data: CustomerQuestionView[] = questions.map((q) => ({
      id: q.id,
      clientKey: q.clientKey,
      clientLabel: q.clientId ? labelById.get(q.clientId) ?? null : null,
      question: q.question,
      status: q.status as QuestionStatus,
      draftSeat: q.draftSeat,
      draftAnswer: q.draftAnswer,
      answer: q.answer,
      delivered: q.delivered,
      createdAt: q.createdAt.toISOString(),
    }))
    return Response.json({ success: true, data } satisfies APIResponse<CustomerQuestionView[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Questions query failed' },
      { status: 500 }
    )
  }
}
