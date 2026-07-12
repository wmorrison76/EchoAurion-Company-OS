import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { draftAnswer, draftPlan, pickDraftSeat } from '@/lib/support-relay'
import { dispatch } from '@/lib/board-room/connectors'
import { ROSTER, knightConfigured } from '@/lib/board-room/knights'
import { answerDraftSystemPrompt } from '@/lib/support-voice'
import { maybeStandbyAutoApprove } from '@/lib/standby'
import { ensureTicketFromInbox, toDetail } from '@/lib/help-desk'
import { raiseAlert } from '@/lib/alerts'
import { guardCorePaths } from '@/lib/core-path-guard'
import type { Seat } from '@/types/board-room'
import type { HelpTicketDetail } from '@/types/help-desk'

const EXTRA_SEATS: Seat[] = ['strategist', 'analyst', 'scout']

/**
 * Auto-run Knights when a new inbound question arrives.
 * Default ON (William's ask). Set AUTO_KNIGHTS_ON_QUESTION=false to disable
 * unless standby/autonomy is draft_only | assist | standby | autopilot | auto_answer_low_risk.
 */
export function shouldAutoKnightsOnQuestion(): boolean {
  const flag = (process.env.AUTO_KNIGHTS_ON_QUESTION ?? 'true').trim().toLowerCase()
  if (flag === 'true' || flag === '1' || flag === 'yes') return true
  if (flag === 'false' || flag === '0' || flag === 'no') {
    const autonomy = (process.env.AUTONOMY_DIAL ?? '').trim().toLowerCase()
    if (autonomy === 'assist' || autonomy === 'standby' || autonomy === 'autopilot') {
      return true
    }
    const standby = (process.env.KNIGHTS_STANDBY_MODE ?? 'off').trim().toLowerCase()
    return (
      standby === 'draft_only' ||
      standby === 'auto_answer_low_risk' ||
      standby === 'assist' ||
      standby === 'standby' ||
      standby === 'autopilot'
    )
  }
  return true
}

export interface KnightsDispatchResult {
  ticket: HelpTicketDetail
  knightCount: number
  autoApproved: boolean
  reason?: string
}

/**
 * Ask the Knights for counsel on a Help Desk ticket.
 * Appends KNIGHT messages, sets AWAITING_APPROVAL, then maybe standby auto-approve.
 */
export async function dispatchKnightsOnTicket(
  ticketId: string,
  opts?: { actor?: 'william_morrison' | 'computer_agent' }
): Promise<KnightsDispatchResult> {
  const actor = opts?.actor ?? 'william_morrison'
  const ticket = await db.helpTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) throw new Error('Ticket not found')

  if (!pickDraftSeat()) {
    throw new Error('No AI seat is configured — set knight API keys')
  }

  await db.helpTicket.update({
    where: { id: ticketId },
    data: { status: 'WITH_KNIGHTS' },
  })
  await db.helpMessage.create({
    data: {
      ticketId,
      role: 'SYSTEM',
      body:
        actor === 'computer_agent'
          ? 'Inbound question — Knights drafting automatically. Review before send unless standby auto-approves low-risk TEXT.'
          : 'Asking the Knights of the Round Table… drafts are for your review only — nothing is sent until you Approve.',
    },
  })

  const thread = ticket.messages
    .filter((m) => m.role !== 'SYSTEM')
    .map((m) => `[${m.role}${m.seat ? `:${m.seat}` : ''}] ${m.body}`)
    .join('\n\n')
    .slice(0, 6000)

  const prompt = `Help Desk ticket: ${ticket.subject}\nChannel: ${ticket.channel}\n\nThread:\n${thread || ticket.subject}`

  const knightBodies: Array<{ seat: string | null; body: string }> = []

  if (ticket.channel === 'FEATURE') {
    const plan = await draftPlan(ticket.subject, thread || ticket.subject, 'ADDON')
    if (plan.answer) {
      knightBodies.push({ seat: plan.seat, body: plan.answer })
    } else if (plan.error) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: `Knights draft unavailable: ${plan.error}`,
        },
      })
    }
  } else {
    const primary = await draftAnswer(prompt)
    if (primary.answer) {
      knightBodies.push({ seat: primary.seat, body: primary.answer })
    } else if (primary.error) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: `Primary knight unavailable: ${primary.error}`,
        },
      })
    }

    const extras = EXTRA_SEATS.filter(
      (s) => s !== primary.seat && knightConfigured(ROSTER[s])
    ).slice(0, 2)

    const extraResults = await Promise.allSettled(
      extras.map(async (seat) => {
        const result = await dispatch(ROSTER[seat], {
          system: answerDraftSystemPrompt(),
          user: prompt,
        })
        if (result.status === 'RESPONDED' && result.content) {
          return { seat, body: result.content }
        }
        return null
      })
    )

    for (const r of extraResults) {
      if (r.status === 'fulfilled' && r.value) {
        knightBodies.push({ seat: r.value.seat, body: r.value.body })
      }
    }
  }

  for (const k of knightBodies) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'KNIGHT',
        body: k.body,
        seat: k.seat,
      },
    })
  }

  if (knightBodies.length === 0) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: 'No knight responses returned. Check API keys or reply manually.',
      },
    })
  }

  // Hallucination / core self-harm guard — scan drafts before standby.
  const coreGuard = guardCorePaths({
    planText: knightBodies.map((k) => k.body).join('\n'),
    subject: ticket.subject,
  })
  if (coreGuard.needsHumanCoreReview) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: `NEEDS_HUMAN_CORE_REVIEW — ${coreGuard.reason}\nMatched: ${coreGuard.matched.join(', ') || 'warn-list'}\nStandby auto-approve blocked. Dual control required.`,
      },
    })
  }

  // Sync primary draft onto linked CustomerQuestion when present.
  const primaryDraft = knightBodies[0]
  if (ticket.customerQuestionId && primaryDraft?.body) {
    await db.customerQuestion.update({
      where: { id: ticket.customerQuestionId },
      data: {
        draftAnswer: primaryDraft.body,
        draftSeat: primaryDraft.seat,
        status: 'DRAFTED',
      },
    })
  }

  const updated = await db.helpTicket.update({
    where: { id: ticketId },
    data: {
      status: knightBodies.length > 0 ? 'AWAITING_APPROVAL' : 'OPEN',
      ...(coreGuard.needsHumanCoreReview ? { needsHumanCoreReview: true } : {}),
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      voiceNotes: { orderBy: { createdAt: 'asc' } },
      _count: { select: { messages: true } },
    },
  })

  await audit(actor, 'help_desk.knights.dispatch', ticketId, {
    seats: knightBodies.map((k) => k.seat),
    count: knightBodies.length,
    coreGuard: coreGuard.flag,
  })

  let autoApproved = false
  let reason: string | undefined
  if (updated.status === 'AWAITING_APPROVAL' && !coreGuard.needsHumanCoreReview) {
    const standby = await maybeStandbyAutoApprove(ticketId)
    autoApproved = standby.autoApproved
    reason = standby.reason
    if (autoApproved) {
      const refreshed = await db.helpTicket.findUnique({
        where: { id: ticketId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          voiceNotes: { orderBy: { createdAt: 'asc' } },
          _count: { select: { messages: true } },
        },
      })
      if (refreshed) {
        return {
          ticket: toDetail(refreshed),
          knightCount: knightBodies.length,
          autoApproved: true,
          reason,
        }
      }
    }
  } else if (coreGuard.needsHumanCoreReview) {
    reason = 'NEEDS_HUMAN_CORE_REVIEW — standby blocked'
  }

  return {
    ticket: toDetail(updated),
    knightCount: knightBodies.length,
    autoApproved,
    reason,
  }
}

/**
 * After relay receives a customer question: ensure HelpTicket TEXT + optional Knights.
 * Fire-and-forget safe — errors are logged via SYSTEM messages / alerts.
 */
export async function processInboundQuestion(
  questionId: string
): Promise<{ ticketId: string; knightsRan: boolean; autoApproved: boolean }> {
  const detail = await ensureTicketFromInbox({ kind: 'question', id: questionId })
  const ticketId = detail.id

  if (!shouldAutoKnightsOnQuestion()) {
    await raiseAlert({
      kind: 'question',
      severity: 'WARN',
      title: 'New customer question (no auto-Knights)',
      body: detail.subject.slice(0, 140),
      entityRef: ticketId,
      url: `/help-desk?ticket=${ticketId}`,
    })
    return { ticketId, knightsRan: false, autoApproved: false }
  }

  if (!pickDraftSeat()) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: 'Auto-Knights skipped — no AI seat configured. William can Ask Knights from Help Desk.',
      },
    })
    return { ticketId, knightsRan: false, autoApproved: false }
  }

  try {
    const result = await dispatchKnightsOnTicket(ticketId, { actor: 'computer_agent' })
    if (!result.autoApproved) {
      await raiseAlert({
        kind: 'question',
        severity: 'WARN',
        title: 'Knights drafted — awaiting approval',
        body: detail.subject.slice(0, 140),
        entityRef: ticketId,
        url: `/help-desk?ticket=${ticketId}`,
      })
    }
    return {
      ticketId,
      knightsRan: true,
      autoApproved: result.autoApproved,
    }
  } catch (err) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: `Auto-Knights failed: ${err instanceof Error ? err.message : 'unknown'}`,
      },
    })
    await raiseAlert({
      kind: 'question',
      severity: 'CRITICAL',
      title: 'Auto-Knights failed',
      body: err instanceof Error ? err.message.slice(0, 140) : 'unknown',
      entityRef: ticketId,
      url: `/help-desk?ticket=${ticketId}`,
    })
    return { ticketId, knightsRan: false, autoApproved: false }
  }
}
