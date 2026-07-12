/**
 * Connect computer_agent / Architect into the Knights loop for SYSTEM errors.
 * GLOBAL or high/urgent → queue WorkRequest FIX + draft PR plan + Knights.
 * Draft only — never merge. Actor audit: computer_agent.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { createDraftPrPlan } from '@/lib/pr-from-build'
import { dispatchKnightsOnTicket } from '@/lib/help-desk-knights'
import { recordTimelineEvent } from '@/lib/help-timeline'
import { pickDraftSeat } from '@/lib/support-relay'

export async function queueAgentAndKnights(ticketId: string): Promise<{
  queued: boolean
  workRequestId?: string
  knightsRan: boolean
  prPlanQueued: boolean
  reason?: string
}> {
  const ticket = await db.helpTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) return { queued: false, knightsRan: false, prPlanQueued: false, reason: 'not_found' }
  if (ticket.channel !== 'SYSTEM') {
    return { queued: false, knightsRan: false, prPlanQueued: false, reason: 'not_system' }
  }

  const highSeverity =
    ticket.errorScope === 'GLOBAL' ||
    ticket.priority === 'URGENT' ||
    ticket.priority === 'HIGH'

  if (!highSeverity) {
    return { queued: false, knightsRan: false, prPlanQueued: false, reason: 'below_threshold' }
  }

  await db.helpTicket.update({
    where: { id: ticketId },
    data: { agentWorking: true },
  })

  await recordTimelineEvent({
    ticketId,
    kind: 'detected',
    label: 'Issue detected',
    detail: `Auto-captured · scope=${ticket.errorScope ?? 'USER'} · Agent + Knights working`,
    actor: 'computer_agent',
  }).catch(() => {})

  await recordTimelineEvent({
    ticketId,
    kind: 'fixing',
    label: 'Fixing',
    detail: 'computer_agent queuing Architect PR plan (draft) + Knights counsel',
    actor: 'computer_agent',
  }).catch(() => {})

  await db.helpMessage.create({
    data: {
      ticketId,
      role: 'SYSTEM',
      body: 'Agent + Knights working — computer_agent queued Architect draft PR plan + Knights counsel. Draft only (constitution: no silent merge). Core paths → NEEDS_HUMAN_CORE_REVIEW.',
    },
  })

  let workRequestId = ticket.workRequestId
  if (!workRequestId) {
    const work = await db.workRequest.create({
      data: {
        clientKey: ticket.clientKey ?? 'company-os-internal',
        clientId: ticket.clientId,
        kind: 'FIX',
        title: ticket.subject.replace(/^\[SYSTEM\]\s*/i, '').slice(0, 120),
        detail: [
          `Auto-queued from Help Desk SYSTEM ticket ${ticket.id}.`,
          `fingerprint=${ticket.fingerprint ?? 'n/a'}`,
          `scope=${ticket.errorScope ?? 'n/a'}`,
          `category=${ticket.errorCategory ?? 'n/a'}`,
          `productLine=${ticket.productLine ?? 'n/a'}`,
          `module=${ticket.moduleHint ?? 'n/a'}`,
          '',
          'Remediation: Architect draft PR only. William + Cursor continue the PR while Knights counsel.',
          'Constitution / core-path guard still apply — never remove auth middleware via auto-runbook.',
        ].join('\n'),
        status: 'RECEIVED',
        actor: 'computer_agent',
        context: {
          helpTicketId: ticket.id,
          fingerprint: ticket.fingerprint,
          errorScope: ticket.errorScope,
          autoQueued: true,
        },
      },
    })
    workRequestId = work.id
    await db.helpTicket.update({
      where: { id: ticketId },
      data: { workRequestId },
    })
    await audit('computer_agent', 'help_desk.agent.queue_work', ticketId, {
      workRequestId,
    })
  }

  let prPlanQueued = false
  try {
    await createDraftPrPlan(workRequestId)
    prPlanQueued = true
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: `Architect draft PR plan stored on work ${workRequestId}. Merge forbidden — continue in Cursor / GitHub.`,
      },
    })
  } catch (err) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: `Architect PR plan deferred: ${err instanceof Error ? err.message : 'unknown'}. Knights may still draft.`,
      },
    })
  }

  let knightsRan = false
  if (pickDraftSeat()) {
    try {
      await dispatchKnightsOnTicket(ticketId, { actor: 'computer_agent' })
      knightsRan = true
    } catch (err) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: `Knights dispatch deferred: ${err instanceof Error ? err.message : 'unknown'}. Partial seats may still respond on retry.`,
        },
      })
    }
  } else {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: 'Agent PR plan queued — Knights skipped (no AI seat configured). Remaining seats will be used when keys are set.',
      },
    })
  }

  await audit('computer_agent', 'help_desk.agent.loop', ticketId, {
    workRequestId,
    prPlanQueued,
    knightsRan,
    clientKey: ticket.clientKey,
  })

  return { queued: true, workRequestId, knightsRan, prPlanQueued }
}
