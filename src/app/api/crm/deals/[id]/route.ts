import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { DEAL_STAGES } from '@/types/crm'
import type { APIResponse } from '@/types'
import type { DealStage } from '@/types/crm'

export const dynamic = 'force-dynamic'

const schema = z.object({
  stage: z.enum(DEAL_STAGES).optional(),
  value: z.number().nonnegative().nullable().optional(),
  notes: z.string().optional(),
  title: z.string().min(1).optional(),
  expectedCloseDate: z.string().datetime().nullable().optional(),
})

// Stage updates save immediately (optimistic UI on the client) — §13.2.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid payload' }, { status: 400 })
    }

    const data: Record<string, unknown> = { ...parsed.data }
    if (parsed.data.expectedCloseDate !== undefined) {
      data.expectedCloseDate = parsed.data.expectedCloseDate
        ? new Date(parsed.data.expectedCloseDate)
        : null
    }
    if (parsed.data.stage === 'CLOSED_WON' || parsed.data.stage === 'CLOSED_LOST') {
      data.closedAt = new Date()
    }

    const deal = await db.deal.update({ where: { id: params.id }, data })
    if (parsed.data.stage) {
      await audit('william_morrison', 'crm.deal.stage_update', deal.id, {
        stage: parsed.data.stage,
      })
    }
    return Response.json({
      success: true,
      data: { id: deal.id, stage: deal.stage as DealStage },
    } satisfies APIResponse<{ id: string; stage: DealStage }>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Deal update failed' },
      { status: 500 }
    )
  }
}
