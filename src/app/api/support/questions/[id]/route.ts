import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('answer'), answer: z.string().min(1).max(8000) }),
  z.object({ action: z.literal('dismiss') }),
])

// William approves (answer) or dismisses a customer question. On answer, the
// item becomes deliverable — the deployment pulls it on its next poll.
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
      await db.customerQuestion.update({
        where: { id },
        data: { answer: parsed.data.answer, status: 'ANSWERED', answeredAt: new Date() },
      })
      await audit('william_morrison', 'support.question.answer', id)
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
