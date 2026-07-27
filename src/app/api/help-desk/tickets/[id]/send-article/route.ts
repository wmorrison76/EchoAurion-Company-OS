import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import {
  publishAnswerReady,
  publishShowMessage,
  publishOpenPanel,
} from '@/lib/relay-outbox'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

/**
 * Send a Help File article to the client.
 * Body as show_message + answer_ready; opens article.panelId if set.
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
    const body = (await req.json()) as { articleId?: string }

    if (!body.articleId) {
      return Response.json({ success: false, error: 'articleId is required' }, { status: 400 })
    }

    const [ticket, article] = await Promise.all([
      db.helpTicket.findUnique({ where: { id } }),
      db.helpArticle.findUnique({ where: { id: body.articleId } }),
    ])

    if (!ticket) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }
    if (!article) {
      return Response.json({ success: false, error: 'Article not found' }, { status: 404 })
    }
    if (!ticket.clientKey) {
      return Response.json(
        { success: false, error: 'Ticket has no clientKey — cannot send article to pilot' },
        { status: 400 }
      )
    }

    const message = `${article.title}\n\n${article.body}`

    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'ADMIN',
        body: message,
      },
    })
    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'SYSTEM',
        body: `Help article sent to client: ${article.slug}${
          article.panelId ? ` · will open panel ${article.panelId}` : ''
        }`,
      },
    })

    await publishShowMessage({
      clientKey: ticket.clientKey,
      title: article.title,
      body: article.body,
      severity: 'info',
      ticketId: id,
    })

    const directive = article.panelId
      ? { type: 'open_panel' as const, panelId: article.panelId }
      : { type: 'show_message' as const, title: article.title, body: article.body }

    await publishAnswerReady({
      clientKey: ticket.clientKey,
      questionId: ticket.customerQuestionId ?? id,
      question: ticket.subject,
      answer: message,
      directive,
    })

    if (article.panelId) {
      await publishOpenPanel({
        clientKey: ticket.clientKey,
        panelId: article.panelId,
        ticketId: id,
      })
    }

    const updated = await db.helpTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'help_desk.client.send_article', id, {
      articleId: article.id,
      slug: article.slug,
      panelId: article.panelId,
    })

    return Response.json({
      success: true,
      data: toDetail(updated!),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Send article failed',
      },
      { status: 500 }
    )
  }
}
