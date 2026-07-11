import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import {
  publishAnswerReady,
  publishShowMessage,
  publishOpenPanel,
} from '@/lib/relay-outbox'
import { isKnownPanelId } from '@/lib/help-panels'
import type { Prisma } from '@prisma/client'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

/**
 * Send a reply to the client now (no resolve required).
 * Posts ADMIN message + outbox show_message + answer_ready.
 * Optional open_panel if panelId provided.
 */
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
      message?: string
      title?: string
      severity?: 'info' | 'success' | 'warning' | 'error'
      panelId?: string
      panelParams?: Record<string, unknown>
      resolve?: boolean
    }

    const message = body.message?.trim()
    if (!message) {
      return Response.json({ success: false, error: 'message is required' }, { status: 400 })
    }

    const ticket = await db.helpTicket.findUnique({ where: { id } })
    if (!ticket) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }
    if (!ticket.clientKey) {
      return Response.json(
        { success: false, error: 'Ticket has no clientKey — cannot push to pilot' },
        { status: 400 }
      )
    }

    if (body.panelId && !isKnownPanelId(body.panelId)) {
      return Response.json(
        { success: false, error: `Unknown panelId: ${body.panelId}` },
        { status: 400 }
      )
    }

    const title = body.title?.trim() || 'Support reply'

    await db.helpMessage.create({
      data: { ticketId: id, role: 'ADMIN', body: message },
    })
    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'SYSTEM',
        body: `Sent to client (${ticket.clientKey}) via relay outbox. SSE will push when pilot is connected.`,
      },
    })

    await publishShowMessage({
      clientKey: ticket.clientKey,
      title,
      body: message,
      severity: body.severity ?? 'info',
      ticketId: id,
    })

    await publishAnswerReady({
      clientKey: ticket.clientKey,
      questionId: ticket.customerQuestionId ?? id,
      question: ticket.subject,
      answer: message,
      directive: body.panelId
        ? { type: 'open_panel', panelId: body.panelId, params: body.panelParams ?? null }
        : { type: 'show_message', title, body: message, severity: body.severity ?? 'info' },
    })

    if (body.panelId) {
      await publishOpenPanel({
        clientKey: ticket.clientKey,
        panelId: body.panelId,
        params: body.panelParams,
        ticketId: id,
      })
    }

    if (ticket.customerQuestionId) {
      const directiveJson = body.panelId
        ? ({
            type: 'open_panel',
            panelId: body.panelId,
            params: body.panelParams ?? null,
          } as Prisma.InputJsonValue)
        : undefined
      await db.customerQuestion.update({
        where: { id: ticket.customerQuestionId },
        data: {
          answer: message,
          status: 'ANSWERED',
          answeredAt: new Date(),
          actor: 'william_morrison',
          ...(directiveJson ? { directive: directiveJson } : {}),
        },
      })
    }

    const updated = await db.helpTicket.update({
      where: { id },
      data: body.resolve
        ? { status: 'RESOLVED', resolvedAt: new Date() }
        : { status: ticket.status === 'OPEN' ? 'WAITING' : ticket.status },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'help_desk.client.send', id, {
      clientKey: ticket.clientKey,
      panelId: body.panelId ?? null,
    })

    return Response.json({
      success: true,
      data: toDetail(updated),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Send to client failed',
      },
      { status: 500 }
    )
  }
}
