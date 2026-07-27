import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { DEAL_STAGES } from '@/types/crm'
import type { APIResponse } from '@/types'
import type { BoardCard, DealStage } from '@/types/crm'

export const dynamic = 'force-dynamic'

// Board view: every deal with its contact + most recent outreach (§13.2).
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const deals = await db.deal.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        contact: {
          include: { outreach: { orderBy: { sentAt: 'desc' }, take: 1 } },
        },
      },
    })
    const data: BoardCard[] = deals.map((d) => ({
      dealId: d.id,
      contactId: d.contactId,
      name: `${d.contact.firstName} ${d.contact.lastName}`.trim(),
      company: d.contact.company,
      title: d.contact.title,
      tags: d.contact.tags,
      value: d.value,
      stage: d.stage as DealStage,
      lastOutreachAt: d.contact.outreach[0]?.sentAt.toISOString() ?? null,
    }))
    return Response.json({ success: true, data } satisfies APIResponse<BoardCard[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Board query failed' },
      { status: 500 }
    )
  }
}

const createSchema = z.object({
  contactId: z.string().min(1),
  title: z.string().min(1),
  value: z.number().nonnegative().optional(),
  stage: z.enum(DEAL_STAGES).default('IDENTIFIED'),
})

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid deal payload' }, { status: 400 })
    }
    const deal = await db.deal.create({
      data: { ...parsed.data, value: parsed.data.value ?? null },
    })
    await audit('william_morrison', 'crm.deal.create', deal.id, { title: deal.title })
    return Response.json({ success: true, data: { id: deal.id } } satisfies APIResponse<{ id: string }>, {
      status: 201,
    })
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Deal create failed' },
      { status: 500 }
    )
  }
}
