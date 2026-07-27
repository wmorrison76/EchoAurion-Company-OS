/**
 * Post-resolve CSAT via relay → property UI.
 * Publishes an open_panel / show_message directive so the install can show a
 * 1–5 rating surface (or deep-link). Property submits score via POST /api/relay/csat.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { publishRelayEvent } from '@/lib/relay-outbox'

export interface CsatRelayResult {
  published: boolean
  reason?: string
}

/**
 * After resolve: ask the property UI for CSAT when score not already set.
 */
export async function publishCsatRequest(opts: {
  ticketId: string
  clientKey: string | null | undefined
  subject: string
}): Promise<CsatRelayResult> {
  const clientKey = opts.clientKey?.trim()
  if (!clientKey) {
    return { published: false, reason: 'no clientKey' }
  }

  const existing = await db.helpTicket.findUnique({
    where: { id: opts.ticketId },
    select: { csatScore: true, status: true },
  })
  if (!existing) return { published: false, reason: 'ticket missing' }
  if (existing.csatScore != null) {
    return { published: false, reason: 'csat already set' }
  }

  const deepLink = `/support/csat?ticketId=${encodeURIComponent(opts.ticketId)}`
  const message = `How was support for "${opts.subject.slice(0, 60)}"? Rate 1–5 in Help Desk.`

  await publishRelayEvent(clientKey, 'directive', {
    type: 'open_panel',
    panelId: 'support.csat',
    params: {
      ticketId: opts.ticketId,
      deepLink,
      prompt: message,
    },
  })

  await publishRelayEvent(clientKey, 'show_message', {
    type: 'show_message',
    level: 'info',
    title: 'Rate this support request',
    body: message,
    actions: [
      { label: 'Rate 1–5', href: deepLink },
    ],
  })

  await audit('computer_agent', 'help_desk.csat.request', opts.ticketId, {
    clientKey,
  }).catch(() => {})

  return { published: true }
}

/**
 * Property (or operator) submits CSAT for a resolved ticket.
 */
export async function submitCsatScore(opts: {
  ticketId: string
  clientKey: string
  score: number
  comment?: string | null
  actor?: 'william_morrison' | 'computer_agent'
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (opts.score < 1 || opts.score > 5) {
    return { ok: false, error: 'csatScore must be 1–5', status: 400 }
  }

  const ticket = await db.helpTicket.findUnique({ where: { id: opts.ticketId } })
  if (!ticket) return { ok: false, error: 'Ticket not found', status: 404 }
  if (ticket.clientKey && ticket.clientKey !== opts.clientKey) {
    return { ok: false, error: 'clientKey mismatch', status: 403 }
  }
  if (ticket.csatScore != null) {
    return { ok: false, error: 'CSAT already recorded', status: 409 }
  }

  await db.helpTicket.update({
    where: { id: opts.ticketId },
    data: {
      csatScore: opts.score,
      ...(opts.comment !== undefined
        ? { csatComment: opts.comment?.trim().slice(0, 500) || null }
        : {}),
    },
  })

  await audit(opts.actor ?? 'computer_agent', 'help_desk.csat.submit', opts.ticketId, {
    score: opts.score,
    via: 'relay',
  })

  return { ok: true }
}
