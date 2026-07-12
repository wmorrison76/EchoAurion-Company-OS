/**
 * Notify pilots when an error-capture HelpTicket is RESOLVED.
 * Scope rules:
 *   USER    → show_message to originating clientKey
 *   ACCOUNT → show_message to clientKey (+ property siblings when known)
 *   COHORT  → matching browser/os/appVersion clients when possible, else affected
 *   GLOBAL  → canary_clientKeys first (rolloutStage=canary) → then ALL (fleet)
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { resolveTargetClientKeys } from '@/lib/maintenance'
import { publishRelayEvent, publishShowMessage } from '@/lib/relay-outbox'
import type { ErrorBlastScope } from '@/lib/error-scope'

function friendlyTitle(scope: ErrorBlastScope, stage: string | null): string {
  if (scope === 'GLOBAL' && stage === 'canary') return 'Fix available (early access)'
  if (scope === 'GLOBAL') return 'System update available — issue fixed'
  if (scope === 'COHORT') return 'Update available for your device class'
  return 'Issue resolved — you can continue'
}

function friendlyBody(scope: ErrorBlastScope, subject: string, stage: string | null): string {
  const short = subject.replace(/^\[SYSTEM\]\s*/i, '').slice(0, 120)
  if (scope === 'GLOBAL' && stage === 'canary') {
    return `A canary fix for “${short}” is ready on selected installs. Refresh when convenient. Full fleet rollout follows after confirmation.`
  }
  if (scope === 'GLOBAL') {
    return `The platform issue “${short}” is fixed. Please refresh or restart when convenient — no further action needed.`
  }
  if (scope === 'COHORT') {
    return `A fix for “${short}” is ready for devices like yours. Refresh if the screen still looks off.`
  }
  if (scope === 'ACCOUNT') {
    return `Something that was unavailable for your property is working again (“${short}”). You can continue.`
  }
  return `Something that was unavailable earlier is working again. You can continue — no action needed unless the screen still looks off.`
}

async function resolveCohortClientKeys(ticket: {
  clientKey: string | null
  affectedClientKeys: string[]
  cohortBrowser: string | null
  cohortOs: string | null
  cohortAppVersion: string | null
}): Promise<string[]> {
  const keys = new Set<string>(ticket.affectedClientKeys)
  if (ticket.clientKey) keys.add(ticket.clientKey)

  if (ticket.cohortBrowser || ticket.cohortOs || ticket.cohortAppVersion) {
    const snaps = await db.diagnosticSnapshot.findMany({
      where: {
        OR: [
          ...(ticket.cohortAppVersion
            ? [{ appVersion: ticket.cohortAppVersion }]
            : []),
          ...(ticket.cohortOs
            ? [{ platform: { contains: ticket.cohortOs, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      select: {
        appVersion: true,
        platform: true,
        client: { select: { clientKey: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    for (const m of snaps) {
      if (
        ticket.cohortAppVersion &&
        m.appVersion &&
        m.appVersion !== ticket.cohortAppVersion
      ) {
        continue
      }
      if (
        ticket.cohortOs &&
        m.platform &&
        !m.platform.toLowerCase().includes(ticket.cohortOs.toLowerCase())
      ) {
        continue
      }
      keys.add(m.client.clientKey)
    }
  }

  return Array.from(keys)
}

export async function notifyErrorFixed(ticketId: string): Promise<{
  notified: number
  clientKeys: string[]
  skipped: boolean
  reason?: string
  stage?: string | null
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
  let stage = ticket.rolloutStage
  let clientKeys: string[] = []

  if (scope === 'GLOBAL') {
    const canary = ticket.canaryClientKeys.filter(Boolean)
    if (canary.length > 0 && stage !== 'fleet') {
      clientKeys = canary
      stage = 'canary'
      await db.helpTicket.update({
        where: { id: ticket.id },
        data: { rolloutStage: 'canary' },
      })
    } else {
      clientKeys = await resolveTargetClientKeys('ALL', null)
      stage = 'fleet'
      await db.helpTicket.update({
        where: { id: ticket.id },
        data: { rolloutStage: 'fleet' },
      })
    }
  } else if (scope === 'COHORT') {
    clientKeys = await resolveCohortClientKeys(ticket)
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
    for (const k of ticket.affectedClientKeys) {
      if (!clientKeys.includes(k)) clientKeys.push(k)
    }
  } else {
    if (ticket.clientKey) clientKeys = [ticket.clientKey]
    else if (ticket.affectedClientKeys[0]) clientKeys = [ticket.affectedClientKeys[0]]
  }

  const title = friendlyTitle(scope, stage)
  const body = friendlyBody(scope, ticket.subject, stage)

  let notified = 0
  for (const clientKey of clientKeys) {
    await publishShowMessage({
      clientKey,
      title,
      body,
      severity: 'success',
      ticketId: ticket.id,
    })
    if (scope === 'GLOBAL' || scope === 'COHORT') {
      await publishRelayEvent(clientKey, 'feature_available', {
        type: 'feature_available',
        title,
        body,
        ticketId: ticket.id,
        fingerprint: ticket.fingerprint,
        scope,
        rolloutStage: stage,
        updateDirective: 'refresh_recommended',
      })
      await publishRelayEvent(clientKey, 'directive', {
        type: 'feature_available',
        title,
        body,
        ticketId: ticket.id,
        fingerprint: ticket.fingerprint,
        scope,
        rolloutStage: stage,
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
      body: `Notify-when-fixed delivered to ${notified} pilot(s) · scope=${scope}${stage ? ` · stage=${stage}` : ''} — “Issue detected → fixing → fixed”`,
    },
  })

  await audit('computer_agent', 'help_desk.error_event.notify_fixed', ticket.id, {
    scope,
    notified,
    clientKeys,
    stage,
  })

  return { notified, clientKeys, skipped: false, stage }
}

/** Promote GLOBAL canary → fleet notify for remaining clients. */
export async function promoteCanaryToFleet(ticketId: string): Promise<{
  notified: number
  skipped: boolean
  reason?: string
}> {
  const ticket = await db.helpTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) return { notified: 0, skipped: true, reason: 'not_found' }
  if (ticket.errorScope !== 'GLOBAL') {
    return { notified: 0, skipped: true, reason: 'not_global' }
  }
  await db.helpTicket.update({
    where: { id: ticketId },
    data: { rolloutStage: 'fleet' },
  })
  const result = await notifyErrorFixed(ticketId)
  return { notified: result.notified, skipped: result.skipped, reason: result.reason }
}
