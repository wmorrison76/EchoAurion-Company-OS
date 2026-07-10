import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

export interface StandbyReviewItem {
  id: string
  clientKey: string
  question: string
  answer: string | null
  answeredAt: string | null
  ticketHint: string
}

/**
 * GET /api/support/standby/queue — “Standby approved — review queue” for William.
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const rows = await db.customerQuestion.findMany({
      where: { standbyApproved: true },
      orderBy: { answeredAt: 'desc' },
      take: 50,
    })
    const data: StandbyReviewItem[] = rows.map((r) => ({
      id: r.id,
      clientKey: r.clientKey,
      question: r.question,
      answer: r.answer,
      answeredAt: r.answeredAt?.toISOString() ?? null,
      ticketHint: 'Standby approved — review queue',
    }))
    return Response.json({ success: true, data } satisfies APIResponse<StandbyReviewItem[]>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Standby queue failed',
      },
      { status: 500 }
    )
  }
}
