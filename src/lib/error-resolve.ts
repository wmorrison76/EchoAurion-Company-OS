/**
 * Post-resolve orchestration for SYSTEM error tickets:
 * timeline “fixed” → notify → KnightEval → runbook learning.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { notifyErrorFixed } from '@/lib/error-notify'
import { learnFromResolution, recordKnightEval } from '@/lib/knight-learning'
import { recordTimelineEvent } from '@/lib/help-timeline'
import type { ErrorCategory } from '@/lib/error-taxonomy'

export async function onErrorTicketResolved(input: {
  ticketId: string
  /** Final approved fix / admin answer text. */
  finalFixSummary?: string | null
  actor?: 'william_morrison' | 'computer_agent'
}): Promise<void> {
  const ticket = await db.helpTicket.findUnique({
    where: { id: input.ticketId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!ticket) return
  if (ticket.channel !== 'SYSTEM' || !ticket.fingerprint) {
    // Still record customer-visible done for non-error tickets when called.
    await recordTimelineEvent({
      ticketId: ticket.id,
      kind: 'done',
      label: 'Fixed',
      detail: 'Issue resolved — you can continue.',
      actor: input.actor ?? 'william_morrison',
    }).catch(() => {})
    return
  }

  const actor = input.actor ?? 'william_morrison'

  await recordTimelineEvent({
    ticketId: ticket.id,
    kind: 'fixed',
    label: 'Fixed',
    detail:
      'Issue detected → fixing → fixed. Pilots notified where scope allows.',
    actor,
  }).catch(() => {})

  await db.helpTicket.update({
    where: { id: ticket.id },
    data: { agentWorking: false },
  })

  await notifyErrorFixed(ticket.id).catch((err) => {
    console.error('[error-resolve] notifyErrorFixed failed', err)
  })

  const knightDrafts = ticket.messages
    .filter((m) => m.role === 'KNIGHT')
    .map((m) => m.body)
  const latestKnight = knightDrafts[knightDrafts.length - 1] ?? ''
  const adminFinal =
    input.finalFixSummary?.trim() ||
    ticket.messages.filter((m) => m.role === 'ADMIN').slice(-1)[0]?.body ||
    latestKnight ||
    ticket.subject

  let evalScore: number | null = null
  if (latestKnight && adminFinal) {
    const ev = await recordKnightEval({
      ticketId: ticket.id,
      fingerprint: ticket.fingerprint,
      productLine: ticket.productLine,
      draftText: latestKnight,
      finalFixText: adminFinal,
    }).catch(() => null)
    evalScore = ev?.score ?? null
  }

  if (adminFinal.length >= 40 && ticket.productLine) {
    await learnFromResolution({
      ticketId: ticket.id,
      fingerprint: ticket.fingerprint,
      productLine: ticket.productLine,
      errorCategory: (ticket.errorCategory as ErrorCategory | null) ?? null,
      subject: ticket.subject,
      resolutionSteps: adminFinal,
      evalScore,
      confirmedBy: actor === 'william_morrison' ? 'william_morrison' : null,
    }).catch((err) => {
      console.error('[error-resolve] learnFromResolution failed', err)
    })
  }

  // Drain learning / agent jobs so Knowledge Plane fills without waiting for cron.
  const { drainLearningQueue } = await import('@/lib/echo-learning')
  await drainLearningQueue(8).catch((err) => {
    console.error('[error-resolve] learning queue drain failed', err)
  })

  await audit(actor, 'help_desk.error_event.resolved_flywheel', ticket.id, {
    evalScore,
    fingerprint: ticket.fingerprint,
  })
}
