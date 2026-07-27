/**
 * Cohort messaging — productize “Safari 17 broke print BEO” notify lists.
 * Targets affected + cohort-matched clientKeys only (never unrelated fleet).
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { publishShowMessage, publishRelayEvent } from '@/lib/relay-outbox'
import { redactSensitive } from '@/lib/error-redact'
import type { ErrorBlastScope } from '@/lib/error-scope'

async function resolveCohortClientKeys(ticket: {
  clientKey: string | null
  affectedClientKeys: string[]
  cohortBrowser: string | null
  cohortOs: string | null
  cohortAppVersion: string | null
}): Promise<string[]> {
  const keys = new Set<string>(ticket.affectedClientKeys)
  if (ticket.clientKey) keys.add(ticket.clientKey)

  if (
    keys.size > 0 &&
    (ticket.cohortBrowser || ticket.cohortOs || ticket.cohortAppVersion)
  ) {
    const snaps = await db.diagnosticSnapshot.findMany({
      where: {
        client: { clientKey: { in: Array.from(keys) } },
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
    const matched = new Set<string>()
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
      matched.add(m.client.clientKey)
    }
    if (matched.size > 0) return Array.from(matched)
  }

  return Array.from(keys)
}

function defaultCohortTitle(ticket: {
  subject: string
  cohortBrowser: string | null
  cohortOs: string | null
  moduleHint: string | null
}): string {
  const device = [ticket.cohortBrowser, ticket.cohortOs].filter(Boolean).join(' / ')
  const mod = ticket.moduleHint?.trim()
  if (device && mod) return `${device} · ${mod}`
  if (device) return `Update for ${device}`
  if (mod) return `Update for ${mod}`
  return ticket.subject.replace(/^\[SYSTEM\]\s*/i, '').slice(0, 80) || 'Cohort update'
}

/**
 * Operator-authored cohort notify (status / workaround / fix-ready).
 * Floor copy only — stacks never sent to pilots.
 */
export async function sendCohortMessage(input: {
  ticketId: string
  title?: string
  body: string
  severity?: 'info' | 'success' | 'warning'
  actor?: 'william_morrison' | 'computer_agent'
}): Promise<
  | { ok: true; notified: number; clientKeys: string[] }
  | { ok: false; error: string; code?: string }
> {
  const ticket = await db.helpTicket.findUnique({ where: { id: input.ticketId } })
  if (!ticket) return { ok: false, error: 'Ticket not found', code: 'NOT_FOUND' }
  if (ticket.channel !== 'SYSTEM') {
    return { ok: false, error: 'Cohort messaging is for SYSTEM error tickets', code: 'NOT_SYSTEM' }
  }
  const scope = (ticket.errorScope ?? 'USER') as ErrorBlastScope
  if (scope !== 'COHORT' && scope !== 'ACCOUNT' && scope !== 'GLOBAL') {
    return {
      ok: false,
      error: 'Promote to COHORT (or ACCOUNT/GLOBAL) before cohort notify',
      code: 'SCOPE',
    }
  }

  const body = redactSensitive(input.body, 500)
  if (!body.trim()) return { ok: false, error: 'Message body required', code: 'SCHEMA' }
  if (/\bstack\b|at\s+\w+\.|Error:/i.test(body) && body.includes('\n')) {
    return {
      ok: false,
      error: 'Do not send stack traces to the floor — rewrite as plain status',
      code: 'STACK_FORBIDDEN',
    }
  }

  const clientKeys =
    scope === 'COHORT'
      ? await resolveCohortClientKeys(ticket)
      : Array.from(
          new Set(
            [ticket.clientKey, ...ticket.affectedClientKeys].filter(Boolean) as string[]
          )
        )

  if (clientKeys.length === 0) {
    return { ok: false, error: 'No cohort clientKeys to notify', code: 'EMPTY' }
  }

  const title =
    redactSensitive(input.title?.trim() || defaultCohortTitle(ticket), 120) || 'Cohort update'
  const severity = input.severity ?? 'info'
  const actor = input.actor ?? 'william_morrison'

  let notified = 0
  for (const clientKey of clientKeys.slice(0, 100)) {
    await publishShowMessage({
      clientKey,
      title,
      body,
      severity,
      ticketId: ticket.id,
    })
    await publishRelayEvent(clientKey, 'directive', {
      type: 'show_message',
      title,
      body,
      severity,
      ticketId: ticket.id,
      scope,
      cohort: {
        browser: ticket.cohortBrowser,
        os: ticket.cohortOs,
        appVersion: ticket.cohortAppVersion,
        moduleHint: ticket.moduleHint,
      },
    })
    notified += 1
  }

  await db.helpMessage.create({
    data: {
      ticketId: ticket.id,
      role: 'SYSTEM',
      body: `Cohort message sent to ${notified} pilot(s) · “${title}”`,
    },
  })

  await audit(actor, 'help_desk.cohort_message.send', ticket.id, {
    notified,
    clientKeys: clientKeys.slice(0, 40),
    title,
  })

  return { ok: true, notified, clientKeys }
}

export async function listOpenCohortTickets(limit = 30): Promise<
  Array<{
    id: string
    subject: string
    moduleHint: string | null
    cohortBrowser: string | null
    cohortOs: string | null
    cohortAppVersion: string | null
    affectedCount: number
    occurrenceCount: number
    priority: string
    guestImpact: boolean
    updatedAt: string
  }>
> {
  const { isGuestImpactModule } = await import('@/lib/guest-impact')
  const rows = await db.helpTicket.findMany({
    where: {
      channel: 'SYSTEM',
      errorScope: 'COHORT',
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
  })
  return rows.map((t) => ({
    id: t.id,
    subject: t.subject,
    moduleHint: t.moduleHint,
    cohortBrowser: t.cohortBrowser,
    cohortOs: t.cohortOs,
    cohortAppVersion: t.cohortAppVersion,
    affectedCount: t.affectedClientKeys.length,
    occurrenceCount: t.occurrenceCount,
    priority: t.priority,
    guestImpact: isGuestImpactModule(t.moduleHint),
    updatedAt: t.updatedAt.toISOString(),
  }))
}
