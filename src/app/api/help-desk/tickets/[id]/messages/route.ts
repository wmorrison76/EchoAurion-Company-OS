import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import type { APIResponse } from '@/types'
import type { HelpMessageRole, HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = (await req.json()) as {
      body?: string
      role?: HelpMessageRole
      seat?: string
    }

    const text = body.body?.trim()
    if (!text) {
      return Response.json({ success: false, error: 'body is required' }, { status: 400 })
    }

    const ticket = await db.helpTicket.findUnique({ where: { id } })
    if (!ticket) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }

    const role: HelpMessageRole = body.role ?? 'ADMIN'

    await db.helpMessage.create({
      data: {
        ticketId: id,
        role,
        body: text,
        seat: body.seat ?? null,
      },
    })

    const nextStatus =
      role === 'ADMIN' && ticket.status === 'WAITING'
        ? 'OPEN'
        : role === 'CUSTOMER'
          ? 'WAITING'
          : ticket.status

    const updated = await db.helpTicket.update({
      where: { id },
      data: { status: nextStatus },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'help_desk.message.create', id, { role })

    return Response.json({
      success: true,
      data: toDetail(updated),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Message create failed',
      },
      { status: 500 }
    )
  }
}
