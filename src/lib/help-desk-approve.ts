import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import { onErrorTicketResolved } from '@/lib/error-resolve'
import { publishAnswerReady, publishWorkStatus } from '@/lib/relay-outbox'
import { afterApproveDeliverLive } from '@/lib/live-repair-delivery'
import { isEchoAiTicket } from '@/lib/echo-ticket-priority'
import { closeReasonForApprove } from '@/lib/fix-disposition'
import { sanitizeCustomerFacingAnswer } from '@/lib/help-desk-customer-copy'
import type { HelpTicketDetail } from '@/types/help-desk'

export type HelpDeskApproveMode = 'reply' | 'approve_free' | 'send_quote'
export type HelpDeskApproveActor = 'william_morrison' | 'computer_agent'

export type ApproveHelpTicketInput = {
  ticketId: string
  mode?: HelpDeskApproveMode
  answer?: string
  knightMessageId?: string
  actor?: HelpDeskApproveActor
}

export type ApproveHelpTicketResult =
  { ok: true; detail: HelpTicketDetail } | { ok: false; error: string; status: number }

function resolveAnswer(
  ticket: { messages: Array<{ id: string; role: string; body: string }> },
  input: Pick<ApproveHelpTicketInput, 'answer' | 'knightMessageId' | 'mode'>
): string {
  let answer = input.answer?.trim() ?? ''
  if (!answer && input.knightMessageId) {
    const km = ticket.messages.find((m) => m.id === input.knightMessageId && m.role === 'KNIGHT')
    if (km) answer = km.body
  }
  if (!answer && (input.mode ?? 'reply') === 'reply') {
    const latestKnight = ticket.messages.find((m) => m.role === 'KNIGHT')
    if (latestKnight) answer = latestKnight.body
  }
  return sanitizeCustomerFacingAnswer(answer)
}

/**
 * Core Help Desk approve path — same behavior as POST /api/help-desk/tickets/[id]/approve.
 * Used by the route, bulk scripts, and ops sweep.
 */
export async function approveHelpTicket(
  input: ApproveHelpTicketInput
): Promise<ApproveHelpTicketResult> {
  const actor = input.actor ?? 'william_morrison'
  const mode = input.mode ?? 'reply'
  const { ticketId: id } = input

  const ticket = await db.helpTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } },
  })
  if (!ticket) {
    return { ok: false, error: 'Ticket not found', status: 404 }
  }

  const answer = resolveAnswer(ticket, input)

  if (mode === 'reply') {
    if (!answer) {
      return {
        ok: false,
        error: 'answer is required (or select a knight draft)',
        status: 400,
      }
    }

    await db.helpMessage.create({
      data: { ticketId: id, role: 'ADMIN', body: answer },
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
          actor,
        },
      })
      await audit(actor, 'support.question.answer', ticket.customerQuestionId)
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

    const disposition = closeReasonForApprove({
      answer,
      subject: ticket.subject,
      needsHumanCoreReview: ticket.needsHumanCoreReview,
      messageBodies: ticket.messages.map((m) => m.body),
    })
    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'SYSTEM',
        body:
          disposition === 'reply_sent_code_pending'
            ? 'Disposition: reply sent · code not deployed. Approve pushes chat/echo_repair_ready only — no merge, no Render deploy.'
            : disposition === 'resolved_fix'
              ? 'Disposition: marked as product fix — verify commit is on the luccca-web deploy branch before treating as done.'
              : 'Disposition: how-to / config reply (no code deploy expected).',
      },
    })

    const updated = await db.helpTicket.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        closeReason: disposition,
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await onErrorTicketResolved({
      ticketId: id,
      finalFixSummary: answer,
      actor,
    }).catch((err) => {
      console.error('[help-desk] onErrorTicketResolved failed', err)
    })

    await audit(actor, 'help_desk.ticket.approve', id, {
      mode: 'reply',
      closeReason: disposition,
    })

    const refreshed = await db.helpTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    return { ok: true, detail: toDetail(refreshed ?? updated) }
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
          actor,
        },
      })
      await audit(actor, 'work.request.approve_free', ticket.workRequestId)
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

    await audit(actor, 'help_desk.ticket.approve', id, { mode: 'approve_free' })
    return { ok: true, detail: toDetail(updated) }
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
          actor,
        },
      })
      await audit(actor, 'work.request.quote', ticket.workRequestId)
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

  await audit(actor, 'help_desk.ticket.approve', id, { mode: 'send_quote' })
  return { ok: true, detail: toDetail(updated) }
}

export type BulkApproveAwaitingResult = {
  approved: number
  skipped: number
  failed: number
  results: Array<{
    ticketId: string
    subject: string
    outcome: 'approved' | 'skipped' | 'failed'
    error?: string
  }>
}

/**
 * Approve every ticket in AWAITING_APPROVAL using the real reply path.
 * Skips tickets with no knight draft (nothing to send).
 * Honors the same safety locks as maybeStandbyAutoApprove:
 * FEATURE channel, BUILD/BILLING gates, and needsHumanCoreReview stay locked
 * for individual Approve & send (dual control).
 */
export async function approveAllAwaitingApproval(opts?: {
  actor?: HelpDeskApproveActor
  dryRun?: boolean
}): Promise<BulkApproveAwaitingResult> {
  const actor = opts?.actor ?? 'william_morrison'
  const dryRun = opts?.dryRun ?? false

  const tickets = await db.helpTicket.findMany({
    where: { status: 'AWAITING_APPROVAL' },
    include: {
      messages: {
        where: { role: 'KNIGHT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const results: BulkApproveAwaitingResult['results'] = []
  let approved = 0
  let skipped = 0
  let failed = 0

  for (const ticket of tickets) {
    if (ticket.channel === 'FEATURE') {
      skipped += 1
      results.push({
        ticketId: ticket.id,
        subject: ticket.subject,
        outcome: 'skipped',
        error: 'FEATURE / WorkRequest never bulk-approved — dual control required',
      })
      continue
    }
    if (ticket.intakeGate === 'BUILD' || ticket.intakeGate === 'BILLING') {
      skipped += 1
      results.push({
        ticketId: ticket.id,
        subject: ticket.subject,
        outcome: 'skipped',
        error: `${ticket.intakeGate} gate never bulk-approved — Approve & send required`,
      })
      continue
    }
    if (ticket.needsHumanCoreReview) {
      skipped += 1
      results.push({
        ticketId: ticket.id,
        subject: ticket.subject,
        outcome: 'skipped',
        error: 'NEEDS_HUMAN_CORE_REVIEW — dual control required',
      })
      continue
    }

    const draft = ticket.messages[0]?.body?.trim()
    if (!draft) {
      skipped += 1
      results.push({
        ticketId: ticket.id,
        subject: ticket.subject,
        outcome: 'skipped',
        error: 'No knight draft to approve',
      })
      continue
    }

    if (dryRun) {
      approved += 1
      results.push({
        ticketId: ticket.id,
        subject: ticket.subject,
        outcome: 'approved',
      })
      continue
    }

    try {
      const result = await approveHelpTicket({
        ticketId: ticket.id,
        mode: 'reply',
        answer: draft,
        actor,
      })
      if (result.ok) {
        approved += 1
        results.push({
          ticketId: ticket.id,
          subject: ticket.subject,
          outcome: 'approved',
        })
      } else {
        failed += 1
        results.push({
          ticketId: ticket.id,
          subject: ticket.subject,
          outcome: 'failed',
          error: result.error,
        })
      }
    } catch (err) {
      failed += 1
      results.push({
        ticketId: ticket.id,
        subject: ticket.subject,
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { approved, skipped, failed, results }
}
