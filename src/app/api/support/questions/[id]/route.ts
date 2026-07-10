import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { publishAnswerReady } from '@/lib/relay-outbox'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('answer'), answer: z.string().min(1).max(8000) }),
  z.object({ action: z.literal('dismiss') }),
])

// William approves (answer) or dismisses a customer question. On answer, the
// item becomes deliverable — SSE push + pull fallback.
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
      return Response.json({ success: false, error: 'Invalid update payload' }, { status: 400 })
    }
    if (parsed.data.action === 'answer') {
      const updated = await db.customerQuestion.update({
        where: { id },
        data: {
          answer: parsed.data.answer,
          status: 'ANSWERED',
          answeredAt: new Date(),
          actor: 'william_morrison',
        },
      })
      await audit('william_morrison', 'support.question.answer', id)
      await publishAnswerReady({
        clientKey: updated.clientKey,
        questionId: updated.id,
        question: updated.question,
        answer: parsed.data.answer,
        directive: updated.directive,
      })
    } else {
      await db.customerQuestion.update({ where: { id }, data: { status: 'DISMISSED' } })
      await audit('william_morrison', 'support.question.dismiss', id)
    }
    return Response.json({ success: true, data: { id } } satisfies APIResponse<{ id: string }>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    )
  }
}
