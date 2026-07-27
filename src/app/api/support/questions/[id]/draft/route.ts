import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { draftAnswer } from '@/lib/support-relay'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

// Asks an AI seat to draft an answer. The draft is stored for William's review
// and is NEVER sent to the customer automatically.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const { id } = await params
    const question = await db.customerQuestion.findUnique({ where: { id } })
    if (!question) {
      return Response.json({ success: false, error: 'Question not found' }, { status: 404 })
    }
    const result = await draftAnswer(question.question, question.context)
    if (!result.answer) {
      return Response.json(
        { success: false, error: result.error ?? 'Draft unavailable' },
        { status: 502 }
      )
    }
    await db.customerQuestion.update({
      where: { id },
      data: { draftAnswer: result.answer, draftSeat: result.seat, status: 'DRAFTED' },
    })
    await audit('william_morrison', 'support.question.draft', id, { seat: result.seat })
    return Response.json(
      { success: true, data: { draftAnswer: result.answer, seat: result.seat } } satisfies APIResponse<{
        draftAnswer: string
        seat: string | null
      }>
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Draft failed' },
      { status: 500 }
    )
  }
}
