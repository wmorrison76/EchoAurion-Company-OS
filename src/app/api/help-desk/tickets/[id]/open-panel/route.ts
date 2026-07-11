import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import { publishOpenPanel } from '@/lib/relay-outbox'
import { isKnownPanelId, getPanel } from '@/lib/help-panels'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

/** Open a known panel on the connected pilot for this ticket's clientKey. */
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
      panelId?: string
      params?: Record<string, unknown>
    }

    if (!body.panelId || !isKnownPanelId(body.panelId)) {
      return Response.json(
        { success: false, error: 'Valid panelId is required' },
        { status: 400 }
      )
    }

    const ticket = await db.helpTicket.findUnique({ where: { id } })
    if (!ticket) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }
    if (!ticket.clientKey) {
      return Response.json(
        { success: false, error: 'Ticket has no clientKey — cannot open panel on pilot' },
        { status: 400 }
      )
    }

    const panel = getPanel(body.panelId)
    await publishOpenPanel({
      clientKey: ticket.clientKey,
      panelId: body.panelId,
      params: body.params,
      ticketId: id,
    })

    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'SYSTEM',
        body: `Opened panel for client: ${panel?.label ?? body.panelId} (${body.panelId}). SSE will push when pilot is connected.`,
      },
    })

    const updated = await db.helpTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'help_desk.client.open_panel', id, {
      clientKey: ticket.clientKey,
      panelId: body.panelId,
    })

    return Response.json({
      success: true,
      data: toDetail(updated!),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Open panel failed',
      },
      { status: 500 }
    )
  }
}
