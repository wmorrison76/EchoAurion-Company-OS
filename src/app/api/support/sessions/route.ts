import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'
import type { SupportSessionStatus, SupportSessionView } from '@/types/support'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const sessions = await db.supportSession.findMany({
      orderBy: { openedAt: 'desc' },
      take: 50,
      include: { client: { select: { label: true } } },
    })
    const data: SupportSessionView[] = sessions.map((s) => ({
      id: s.id,
      topic: s.topic,
      status: s.status as SupportSessionStatus,
      notes: s.notes,
      clientLabel: s.client?.label ?? null,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
    }))
    return Response.json({ success: true, data } satisfies APIResponse<SupportSessionView[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Sessions query failed' },
      { status: 500 }
    )
  }
}

const createSchema = z.object({
  topic: z.string().min(1).max(200),
  clientId: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid session payload' }, { status: 400 })
    }
    const created = await db.supportSession.create({
      data: {
        topic: parsed.data.topic,
        clientId: parsed.data.clientId || null,
        notes: parsed.data.notes ?? null,
        actor: 'william_morrison',
      },
    })
    await audit('william_morrison', 'support.session.open', created.id, { topic: created.topic })
    return Response.json(
      { success: true, data: { id: created.id } } satisfies APIResponse<{ id: string }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Session create failed' },
      { status: 500 }
    )
  }
}
