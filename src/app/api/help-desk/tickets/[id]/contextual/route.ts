import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import { searchHelpArticles } from '@/lib/help-files'
import { HELP_PANEL_IDS } from '@/lib/help-panels'
import { pickDraftSeat } from '@/lib/support-relay'
import { dispatch } from '@/lib/board-room/connectors'
import { ROSTER } from '@/lib/board-room/knights'
import { answerDraftSystemPrompt } from '@/lib/support-voice'
import { detectPayrollRefuse } from '@/lib/payroll-refuse'
import { maybeStandbyAutoApprove } from '@/lib/standby'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'
import type { ContextualHelpResult } from '@/types/help-files'

export const dynamic = 'force-dynamic'

/**
 * Contextual Help composer: question + optional context JSON.
 * Searches HelpArticles, asks Knights with architecture-aware prompt,
 * returns draft + suggested directives. Does NOT send to client.
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
      question?: string
      context?: Record<string, unknown> | string
    }

    const question = body.question?.trim()
    if (!question) {
      return Response.json({ success: false, error: 'question is required' }, { status: 400 })
    }

    const ticket = await db.helpTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 30 } },
    })
    if (!ticket) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }

    const payrollGate = detectPayrollRefuse({
      text: question,
      subject: ticket.subject,
      context: body.context,
      operatorOverride: true,
    })
    if (payrollGate.refuse) {
      await db.helpMessage.create({
        data: { ticketId: id, role: 'SYSTEM', body: payrollGate.operatorNote },
      })
      await db.helpMessage.create({
        data: {
          ticketId: id,
          role: 'KNIGHT',
          seat: 'policy',
          body: payrollGate.customerReply,
        },
      })
      const updated = await db.helpTicket.update({
        where: { id },
        data: { status: 'AWAITING_APPROVAL' },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          voiceNotes: { orderBy: { createdAt: 'asc' } },
          _count: { select: { messages: true } },
        },
      })
      await audit('william_morrison', 'help_desk.contextual.payroll_refuse', id, {
        reason: payrollGate.reason,
        matched: payrollGate.matched,
      })
      const auto = await maybeStandbyAutoApprove(id)
      const refreshedPayroll = auto.autoApproved
        ? await db.helpTicket.findUnique({
            where: { id },
            include: {
              messages: { orderBy: { createdAt: 'asc' } },
              voiceNotes: { orderBy: { createdAt: 'asc' } },
              _count: { select: { messages: true } },
            },
          })
        : updated
      const contextual: ContextualHelpResult = {
        draftAnswer: payrollGate.customerReply,
        suggestedDirectives: [],
        citedArticleIds: [],
        seat: 'policy',
      }
      return Response.json({
        success: true,
        data: { ticket: toDetail(refreshedPayroll ?? updated), contextual },
      } satisfies APIResponse<{ ticket: HelpTicketDetail; contextual: ContextualHelpResult }>)
    }

    if (!pickDraftSeat()) {
      return Response.json(
        { success: false, error: 'No AI seat is configured — set knight API keys' },
        { status: 502 }
      )
    }

    const hits = await searchHelpArticles(question, 5)
    const contextStr =
      typeof body.context === 'string'
        ? body.context
        : body.context
          ? JSON.stringify(body.context, null, 2)
          : ''

    const kbBlock =
      hits.length > 0
        ? hits
            .map(
              (a, i) =>
                `[${i + 1}] slug=${a.slug} title=${a.title} panelId=${a.panelId ?? 'none'}\n${a.body.slice(0, 800)}`
            )
            .join('\n\n')
        : '(no matching help articles)'

    const system =
      answerDraftSystemPrompt() +
      `\n\nYou know the EchoAurion hospitality product and Company OS architecture. Be specific about screens and steps. ` +
      `If UI navigation would help the operator, propose an open_panel directive.\n` +
      `Known panelIds: ${HELP_PANEL_IDS.join(', ')}.\n` +
      `After your customer-facing answer, append a JSON block exactly like:\n` +
      '```json\n{"directives":[{"type":"open_panel","panelId":"beo","params":{}}],"citedSlugs":["slug"]}\n```\n' +
      `Use empty arrays if none. Never auto-execute code changes — only guidance and panel opens.`

    const userPrompt = [
      `Help Desk ticket: ${ticket.subject}`,
      `Channel: ${ticket.channel}`,
      contextStr ? `Operator context:\n${contextStr}` : '',
      `Contextual question:\n${question}`,
      `Help File search hits:\n${kbBlock}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    await db.helpTicket.update({ where: { id }, data: { status: 'WITH_KNIGHTS' } })
    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'SYSTEM',
        body: `Contextual Help: searching Help Files + asking Knights… (${hits.length} article hit${hits.length === 1 ? '' : 's'})`,
      },
    })
    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'CUSTOMER',
        body: `[Contextual] ${question}${contextStr ? `\n\nContext: ${contextStr.slice(0, 500)}` : ''}`,
      },
    })

    const seat = pickDraftSeat()!
    const result = await dispatch(ROSTER[seat], {
      system,
      user: userPrompt,
    })
    let rawAnswer = ''
    if (result.status === 'RESPONDED' && result.content) {
      rawAnswer = result.content
    } else {
      await db.helpMessage.create({
        data: {
          ticketId: id,
          role: 'SYSTEM',
          body: `Contextual Help unavailable: ${result.error ?? result.status}`,
        },
      })
    }

    const { cleanAnswer, directives, citedSlugs } = parseDirectiveBlock(rawAnswer)
    const citedArticleIds = hits
      .filter((h) => citedSlugs.includes(h.slug) || citedSlugs.length === 0)
      .map((h) => h.id)
      .slice(0, 5)

    // If no directives parsed but a hit has panelId, suggest it.
    if (directives.length === 0) {
      const withPanel = hits.find((h) => h.panelId)
      if (withPanel?.panelId) {
        directives.push({
          type: 'open_panel',
          panelId: withPanel.panelId,
        })
      }
    }

    if (cleanAnswer) {
      await db.helpMessage.create({
        data: {
          ticketId: id,
          role: 'KNIGHT',
          body: cleanAnswer,
          seat,
        },
      })
    }

    const resultMeta: ContextualHelpResult = {
      draftAnswer: cleanAnswer,
      suggestedDirectives: directives,
      citedArticleIds,
      seat,
    }

    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'SYSTEM',
        body: `Contextual draft ready. Suggested directives: ${
          directives.length
            ? directives.map((d) => d.type + (d.panelId ? `:${d.panelId}` : '')).join(', ')
            : 'none'
        }. Approve or use Send to client / Open panel — nothing sent yet.`,
      },
    })

    const updated = await db.helpTicket.update({
      where: { id },
      data: { status: cleanAnswer ? 'AWAITING_APPROVAL' : 'OPEN' },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'help_desk.contextual.compose', id, {
      hitCount: hits.length,
      directiveCount: directives.length,
      seat,
    })

    let ticketOut = updated
    if (cleanAnswer) {
      const auto = await maybeStandbyAutoApprove(id)
      if (auto.autoApproved) {
        const refreshed = await db.helpTicket.findUnique({
          where: { id },
          include: {
            messages: { orderBy: { createdAt: 'asc' } },
            voiceNotes: { orderBy: { createdAt: 'asc' } },
            _count: { select: { messages: true } },
          },
        })
        if (refreshed) ticketOut = refreshed
      }
    }

    return Response.json({
      success: true,
      data: {
        ticket: toDetail(ticketOut),
        contextual: resultMeta,
      },
    } satisfies APIResponse<{ ticket: HelpTicketDetail; contextual: ContextualHelpResult }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Contextual help failed',
      },
      { status: 500 }
    )
  }
}

function parseDirectiveBlock(raw: string): {
  cleanAnswer: string
  directives: ContextualHelpResult['suggestedDirectives']
  citedSlugs: string[]
} {
  const fence = /```json\s*([\s\S]*?)```/i.exec(raw)
  const inline = !fence ? /\{\s*"directives"\s*:\s*\[[\s\S]*\}\s*$/.exec(raw) : null
  const jsonText = fence?.[1]?.trim() ?? inline?.[0]?.trim()

  let directives: ContextualHelpResult['suggestedDirectives'] = []
  let citedSlugs: string[] = []
  let cleanAnswer = raw

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as {
        directives?: ContextualHelpResult['suggestedDirectives']
        citedSlugs?: string[]
      }
      if (Array.isArray(parsed.directives)) directives = parsed.directives
      if (Array.isArray(parsed.citedSlugs)) citedSlugs = parsed.citedSlugs
      cleanAnswer = raw
        .replace(/```json\s*[\s\S]*?```/i, '')
        .replace(/\n?\{\s*"directives"\s*:[\s\S]*\}\s*$/, '')
        .trim()
    } catch {
      // keep raw answer
    }
  }

  return { cleanAnswer, directives, citedSlugs }
}
