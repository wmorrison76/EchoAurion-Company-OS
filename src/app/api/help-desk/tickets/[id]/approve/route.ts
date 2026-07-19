import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import { onErrorTicketResolved } from '@/lib/error-resolve'
import { publishAnswerReady, publishWorkStatus } from '@/lib/relay-outbox'
import { afterApproveDeliverLive } from '@/lib/live-repair-delivery'
import { isEchoAiTicket } from '@/lib/echo-ticket-priority'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

/**
 * Approve a knight draft (or custom reply) as the official admin answer.
 * Optionally syncs back to a linked CustomerQuestion.
 *
 * Modes:
 * - reply: send/store admin answer text
 * - approve_free: mark feature/work as complimentary (admin gift)
 * - send_quote: keep FEATURE ticket open and nudge work request toward QUOTED
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
      mode?: 'reply' | 'approve_free' | 'send_quote'
      answer?: string
      knightMessageId?: string
    }

    const ticket = await db.helpTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } },
    })
    if (!ticket) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }

    const mode = body.mode ?? 'reply'
    let answer = body.answer?.trim() ?? ''

    if (!answer && body.knightMessageId) {
      const km = ticket.messages.find((m) => m.id === body.knightMessageId && m.role === 'KNIGHT')
      if (km) answer = km.body
    }

    if (!answer && mode === 'reply') {
      const latestKnight = ticket.messages.find((m) => m.role === 'KNIGHT')
      if (latestKnight) answer = latestKnight.body
    }

    if (mode === 'reply') {
      if (!answer) {
        return Response.json(
          { success: false, error: 'answer is required (or select a knight draft)' },
          { status: 400 }
        )
      }

      await db.helpMessage.create({
        data: {
          ticketId: id,
          role: 'ADMIN',
          body: answer,
        },
      })
      await db.helpMessage.create({
        data: {
          ticketId: id,
          role: 'SYSTEM',
          body: 'Official answer approved. Ready to deliver via relay when intake is connected.',
        },
      })

      if (ticket.customerQuestionId) {
        const q = await db.customerQuestion.update({
          where: { id: ticket.customerQuestionId },
          data: {
            answer,
            status: 'ANSWERED',
            answeredAt: new Date(),
            actor: 'william_morrison',
          },
        })
        await audit('william_morrison', 'support.question.answer', ticket.customerQuestionId)
        const echoAi = isEchoAiTicket({
          intakeChannel: ticket.intakeChannel,
          moduleHint: ticket.moduleHint,
        })
        const ctx =
          q.context && typeof q.context === 'object' && !Array.isArray(q.context)
            ? (q.context as Record<string, unknown>)
            : null
        await publishAnswerReady({
          clientKey: q.clientKey,
          questionId: q.id,
          question: q.question,
          answer,
          directive: echoAi ? undefined : q.directive,
          echoSilent: echoAi,
          ticketId: id,
          userId: typeof ctx?.userId === 'string' ? ctx.userId : null,
          panelId:
            typeof ctx?.panelId === 'string'
              ? ctx.panelId
              : typeof ctx?.moduleHint === 'string'
                ? ctx.moduleHint
                : null,
          failedStep: typeof ctx?.failedStep === 'string' ? ctx.failedStep : null,
        })
        const live = await afterApproveDeliverLive({
          clientKey: q.clientKey,
          ticketId: id,
          questionId: q.id,
          question: q.question,
          answer,
          directive: q.directive,
          moduleHint: ticket.moduleHint,
          intakeChannel: ticket.intakeChannel,
          echoAi,
          context: q.context,
          answerReadyPublished: true,
        })
        await db.helpMessage.create({
          data: {
            ticketId: id,
            role: 'SYSTEM',
            body: live.echoRepairReady
              ? 'Silent radio: echo_repair_ready pushed to Echo only (no user toast / reload).'
              : live.codeDeployNotice
                ? 'Live repair: update notice pushed (banner_only — pilot auto-reload OFF by default).'
                : live.softDirective
                  ? 'Live repair: soft directive pushed to pilot SSE (no refresh required).'
                  : 'Approve delivery complete.',
          },
        })
      } else if (ticket.clientKey) {
        const echoAi = isEchoAiTicket({
          intakeChannel: ticket.intakeChannel,
          moduleHint: ticket.moduleHint,
        })
        await publishAnswerReady({
          clientKey: ticket.clientKey,
          questionId: ticket.id,
          question: ticket.subject,
          answer,
          echoSilent: echoAi,
          ticketId: id,
        })
        const live = await afterApproveDeliverLive({
          clientKey: ticket.clientKey,
          ticketId: id,
          questionId: ticket.id,
          question: ticket.subject,
          answer,
          moduleHint: ticket.moduleHint,
          intakeChannel: ticket.intakeChannel,
          echoAi,
          answerReadyPublished: true,
        })
        await db.helpMessage.create({
          data: {
            ticketId: id,
            role: 'SYSTEM',
            body: live.echoRepairReady
              ? 'Silent radio: echo_repair_ready pushed to Echo only (no user toast / reload).'
              : live.codeDeployNotice
                ? 'Live repair: update notice pushed (banner_only — pilot auto-reload OFF by default).'
                : live.softDirective
                  ? 'Live repair: soft directive pushed to pilot SSE (no refresh required).'
                  : 'Approve delivery complete.',
          },
        })
      }

      const updated = await db.helpTicket.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          voiceNotes: { orderBy: { createdAt: 'asc' } },
          _count: { select: { messages: true } },
        },
      })

      await onErrorTicketResolved({
        ticketId: id,
        finalFixSummary: answer,
        actor: 'william_morrison',
      }).catch((err) => {
        console.error('[help-desk] onErrorTicketResolved failed', err)
      })

      await audit('william_morrison', 'help_desk.ticket.approve', id, { mode: 'reply' })

      const refreshed = await db.helpTicket.findUnique({
        where: { id },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          voiceNotes: { orderBy: { createdAt: 'asc' } },
          _count: { select: { messages: true } },
        },
      })

      return Response.json({
        success: true,
        data: toDetail(refreshed ?? updated),
      } satisfies APIResponse<HelpTicketDetail>)
    }

    if (mode === 'approve_free') {
      await db.helpMessage.create({
        data: {
          ticketId: id,
          role: 'ADMIN',
          body:
            answer ||
            'Approved as complimentary / free — we will handle this without a customer quote.',
        },
      })
      await db.helpMessage.create({
        data: {
          ticketId: id,
          role: 'SYSTEM',
          body: 'Policy: Approve free. Billing contact authorization not required for this gift.',
        },
      })

      if (ticket.workRequestId) {
        const work = await db.workRequest.update({
          where: { id: ticket.workRequestId },
          data: {
            approvedByAdmin: true,
            status: 'IN_PROGRESS',
            actor: 'william_morrison',
          },
        })
        await audit('william_morrison', 'work.request.approve_free', ticket.workRequestId)
        await publishWorkStatus({
          clientKey: work.clientKey,
          workId: work.id,
          title: work.title,
          status: work.status,
          plan: work.draftPlan,
        })
      }

      const updated = await db.helpTicket.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          voiceNotes: { orderBy: { createdAt: 'asc' } },
          _count: { select: { messages: true } },
        },
      })

      await audit('william_morrison', 'help_desk.ticket.approve', id, { mode: 'approve_free' })

      return Response.json({
        success: true,
        data: toDetail(updated),
      } satisfies APIResponse<HelpTicketDetail>)
    }

    // send_quote
    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'ADMIN',
        body:
          answer ||
          'This needs a paid change request. Quote will go to the property billing contact for authorization.',
      },
    })
    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'SYSTEM',
        body: 'Policy: Send quote. Only the designated billing contact can authorize spend.',
      },
    })

    if (ticket.workRequestId) {
      const work = await db.workRequest.findUnique({ where: { id: ticket.workRequestId } })
      if (work && work.status === 'RECEIVED') {
        const quoted = await db.workRequest.update({
          where: { id: ticket.workRequestId },
          data: {
            status: 'QUOTED',
            quotedAt: new Date(),
            actor: 'william_morrison',
          },
        })
        await audit('william_morrison', 'work.request.quote', ticket.workRequestId)
        await publishWorkStatus({
          clientKey: quoted.clientKey,
          workId: quoted.id,
          title: quoted.title,
          status: quoted.status,
          plan: quoted.draftPlan,
        })
      }
    }

    const updated = await db.helpTicket.update({
      where: { id },
      data: { status: 'WAITING' },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'help_desk.ticket.approve', id, { mode: 'send_quote' })

    return Response.json({
      success: true,
      data: toDetail(updated),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Approve failed',
      },
      { status: 500 }
    )
  }
}
