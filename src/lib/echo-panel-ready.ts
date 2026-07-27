/**
 * Success signal: panel loaded (possibly late) → cancel/close pending Echo soft tickets.
 * Soft threshold may have already filed; ready cancels the firehose noise.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

const OPEN = ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] as const

export type EchoPanelReadyResult = {
  cancelled: number
  ticketIds: string[]
  questionIds: string[]
  label: string
}

/**
 * Find recent open Echo tickets for this clientKey + panel fingerprint and resolve them.
 * No PII — fingerprint / panelId only.
 */
export async function cancelPendingEchoPanelTickets(input: {
  clientKey: string
  panelId: string
  fingerprint?: string | null
  elapsedMs?: number | null
  reason?: string
}): Promise<EchoPanelReadyResult> {
  const clientKey = input.clientKey.trim()
  const panelId = input.panelId.trim().slice(0, 80)
  if (!clientKey || !panelId) {
    return {
      cancelled: 0,
      ticketIds: [],
      questionIds: [],
      label: '○ Missing clientKey or panelId',
    }
  }

  const since = new Date(Date.now() - 30 * 60_000)
  const candidates = await db.helpTicket.findMany({
    where: {
      clientKey,
      intakeChannel: 'ECHO',
      status: { in: [...OPEN] },
      createdAt: { gte: since },
      OR: [
        { moduleHint: { contains: panelId, mode: 'insensitive' } },
        { subject: { contains: panelId, mode: 'insensitive' } },
      ],
    },
    take: 20,
    select: {
      id: true,
      customerQuestionId: true,
      subject: true,
    },
  })

  // Prefer fingerprint match via linked question context when provided.
  let toCancel = candidates
  if (input.fingerprint && candidates.length > 0) {
    const qIds = candidates
      .map((c) => c.customerQuestionId)
      .filter((id): id is string => !!id)
    if (qIds.length > 0) {
      const qs = await db.customerQuestion.findMany({
        where: { id: { in: qIds } },
        select: { id: true, context: true },
      })
      const fpMatch = new Set<string>()
      for (const q of qs) {
        const ctx =
          q.context && typeof q.context === 'object' && !Array.isArray(q.context)
            ? (q.context as Record<string, unknown>)
            : {}
        if (
          ctx.fingerprint === input.fingerprint ||
          ctx.panelId === panelId ||
          String(ctx.moduleHint ?? '').toLowerCase().includes(panelId.toLowerCase())
        ) {
          fpMatch.add(q.id)
        }
      }
      if (fpMatch.size > 0) {
        toCancel = candidates.filter(
          (c) => c.customerQuestionId && fpMatch.has(c.customerQuestionId)
        )
      }
    }
  }

  const now = new Date()
  const ticketIds: string[] = []
  const questionIds: string[] = []
  const reason =
    input.reason?.slice(0, 120) ||
    `panel_ready_late${typeof input.elapsedMs === 'number' ? `_${Math.round(input.elapsedMs)}ms` : ''}`

  for (const t of toCancel) {
    await db.helpTicket.update({
      where: { id: t.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
      },
    })
    await db.helpMessage.create({
      data: {
        ticketId: t.id,
        role: 'SYSTEM',
        body: `Success signal: panel loaded — cancelled pending Echo watch (${reason}).`,
      },
    })
    ticketIds.push(t.id)
    if (t.customerQuestionId) {
      await db.customerQuestion.update({
        where: { id: t.customerQuestionId },
        data: {
          status: 'DISMISSED',
          answer: `Auto-cancelled: panel became ready (${reason}).`,
          answeredAt: now,
        },
      })
      questionIds.push(t.customerQuestionId)
    }
    await audit('computer_agent', 'echo.panel_ready.cancel', t.id, {
      clientKey,
      panelId,
      fingerprint: input.fingerprint ?? null,
      elapsedMs: input.elapsedMs ?? null,
      why: 'success_signal_loaded_late',
    })
  }

  return {
    cancelled: ticketIds.length,
    ticketIds,
    questionIds,
    label:
      ticketIds.length > 0
        ? `✓ Cancelled ${ticketIds.length} pending Echo ticket(s)`
        : '✓ No pending Echo tickets to cancel',
  }
}
