/**
 * Notify pilots when an error-capture HelpTicket is RESOLVED.
 * Scope rules:
 *   USER    → show_message to originating clientKey
 *   ACCOUNT → show_message to clientKey (+ property siblings when known)
 *   GLOBAL  → feature_available + show_message to all SupportClients
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { resolveTargetClientKeys } from '@/lib/maintenance'
import { publishRelayEvent, publishShowMessage } from '@/lib/relay-outbox'
import type { ErrorBlastScope } from '@/lib/error-scope'

export async function notifyErrorFixed(ticketId: string): Promise<{
  notified: number
  clientKeys: string[]
  skipped: boolean
  reason?: string
}> {
  const ticket = await db.helpTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) return { notified: 0, clientKeys: [], skipped: true, reason: 'not_found' }
  if (ticket.channel !== 'SYSTEM' || !ticket.fingerprint) {
    return { notified: 0, clientKeys: [], skipped: true, reason: 'not_error_ticket' }
  }
  if (!ticket.notifyWhenFixed) {
    return { notified: 0, clientKeys: [], skipped: true, reason: 'notify_disabled' }
  }

  const scope = (ticket.errorScope ?? 'USER') as ErrorBlastScope
  let clientKeys: string[] = []

  if (scope === 'GLOBAL') {
    clientKeys = await resolveTargetClientKeys('ALL', null)
  } else if (scope === 'ACCOUNT') {
    const primary = ticket.clientKey
    if (primary) {
      const client = await db.supportClient.findUnique({ where: { clientKey: primary } })
      if (client?.property) {
        clientKeys = await resolveTargetClientKeys('PROPERTY', client.property)
      } else {
        clientKeys = [primary]
      }
    }
    // Also include any affected keys recorded during capture.
    for (const k of ticket.affectedClientKeys) {
      if (!clientKeys.includes(k)) clientKeys.push(k)
    }
  } else {
    // USER — originating install (sessionHint rides in payload for client UX).
    if (ticket.clientKey) clientKeys = [ticket.clientKey]
    else if (ticket.affectedClientKeys[0]) clientKeys = [ticket.affectedClientKeys[0]]
  }

  const title =
    scope === 'GLOBAL'
      ? 'System update available'
      : 'Issue resolved'
  const body =
    scope === 'GLOBAL'
      ? `A platform fix for “${ticket.subject.replace(/^\[SYSTEM\]\s*/, '')}” is ready. Please refresh or restart when convenient.`
      : `Something that was unavailable earlier is working again. You can continue — no action needed unless the screen still looks off.`

  let notified = 0
  for (const clientKey of clientKeys) {
    await publishShowMessage({
      clientKey,
      title,
      body,
      severity: 'success',
      ticketId: ticket.id,
    })
    if (scope === 'GLOBAL') {
      await publishRelayEvent(clientKey, 'feature_available', {
        type: 'feature_available',
        title,
        body,
        ticketId: ticket.id,
        fingerprint: ticket.fingerprint,
        scope,
        updateDirective: 'refresh_recommended',
      })
      await publishRelayEvent(clientKey, 'directive', {
        type: 'feature_available',
        title,
        body,
        ticketId: ticket.id,
        fingerprint: ticket.fingerprint,
        scope,
        updateDirective: 'refresh_recommended',
      })
    } else if (scope === 'USER' && ticket.sessionHint) {
      await publishRelayEvent(clientKey, 'directive', {
        type: 'show_message',
        title,
        body,
        severity: 'success',
        ticketId: ticket.id,
        sessionHint: ticket.sessionHint,
      })
    }
    notified += 1
  }

  await db.helpMessage.create({
    data: {
      ticketId: ticket.id,
      role: 'SYSTEM',
      body: `Notify-when-fixed delivered to ${notified} pilot(s) · scope=${scope}`,
    },
  })

  await audit('computer_agent', 'help_desk.error_event.notify_fixed', ticket.id, {
    scope,
    notified,
    clientKeys,
  })

  return { notified, clientKeys, skipped: false }
}
