/**
 * Human on-call: Echo TECH tickets unresolved for N minutes → email William
 * via the same Resend/SMTP path as fix-digest.
 */

import { db } from '@/lib/db'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { audit } from '@/lib/audit'
import { echoOncallMinutes } from '@/lib/echo-guardrails'

export type EchoOncallResult = {
  minutes: number
  since: string
  to: string | null
  emailed: boolean
  skippedReason?:
    | 'email_not_configured'
    | 'no_recipient'
    | 'send_failed'
    | 'empty'
    | 'disabled'
  count: number
  ticketIds: string[]
  label: string
}

function oncallTo(): string | null {
  return (
    process.env.ECHO_ONCALL_TO?.trim() ||
    process.env.FIX_DIGEST_TO?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    null
  )
}

function oncallEnabled(): boolean {
  const raw = (process.env.ECHO_ONCALL ?? 'on').trim().toLowerCase()
  return !(raw === 'off' || raw === 'false' || raw === '0')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const OPEN = ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] as const

/**
 * Page William when Echo tickets sit unresolved past ECHO_ONCALL_MINUTES.
 * Dedupes via audit_log so we don't email every cron tick for the same ticket.
 */
export async function runEchoOncall(): Promise<EchoOncallResult> {
  const minutes = echoOncallMinutes()
  const since = new Date(Date.now() - minutes * 60_000)
  const to = oncallTo()

  if (!oncallEnabled()) {
    return {
      minutes,
      since: since.toISOString(),
      to,
      emailed: false,
      skippedReason: 'disabled',
      count: 0,
      ticketIds: [],
      label: '○ Echo on-call disabled',
    }
  }

  const tickets = await db.helpTicket.findMany({
    where: {
      intakeChannel: 'ECHO',
      status: { in: [...OPEN] },
      createdAt: { lte: since },
    },
    orderBy: { createdAt: 'asc' },
    take: 40,
    select: {
      id: true,
      subject: true,
      clientKey: true,
      status: true,
      createdAt: true,
      moduleHint: true,
    },
  })

  // Skip tickets already paged in the last 6 hours.
  const recentlyPaged = await db.auditLog.findMany({
    where: {
      action: 'ops.echo_oncall.page',
      createdAt: { gte: new Date(Date.now() - 6 * 60 * 60_000) },
    },
    select: { entityId: true },
    take: 200,
  })
  const pagedIds = new Set(
    recentlyPaged.map((r) => r.entityId).filter((id): id is string => !!id)
  )
  const pending = tickets.filter((t) => !pagedIds.has(t.id))

  if (pending.length === 0) {
    return {
      minutes,
      since: since.toISOString(),
      to,
      emailed: false,
      skippedReason: 'empty',
      count: 0,
      ticketIds: [],
      label: '✓ No Echo tickets past on-call window',
    }
  }

  if (!isEmailConfigured()) {
    await audit('computer_agent', 'ops.echo_oncall.skip', undefined, {
      reason: 'email_not_configured',
      count: pending.length,
      ticketIds: pending.map((t) => t.id),
    })
    return {
      minutes,
      since: since.toISOString(),
      to,
      emailed: false,
      skippedReason: 'email_not_configured',
      count: pending.length,
      ticketIds: pending.map((t) => t.id),
      label: '⚠ Echo on-call — email not configured',
    }
  }

  if (!to) {
    await audit('computer_agent', 'ops.echo_oncall.skip', undefined, {
      reason: 'no_recipient',
      count: pending.length,
    })
    return {
      minutes,
      since: since.toISOString(),
      to: null,
      emailed: false,
      skippedReason: 'no_recipient',
      count: pending.length,
      ticketIds: pending.map((t) => t.id),
      label: '⚠ Echo on-call — no recipient',
    }
  }

  const lines = pending.map((t) => {
    const ageMin = Math.round((Date.now() - t.createdAt.getTime()) / 60_000)
    return `${t.createdAt.toISOString().slice(0, 16)} · ${ageMin}m open · ${t.clientKey ?? '?'} · ${t.status} · ${t.moduleHint ?? t.subject.slice(0, 60)} · ${t.id}`
  })

  const subject = `⚠ Echo on-call — ${pending.length} unresolved after ${minutes}m`
  const text = [
    `Echo TECH tickets still open after ${minutes} minutes (Knights / auto-send did not clear them).`,
    '',
    ...lines,
    '',
    'Open Help Desk → filter ◆ Echo AI.',
  ].join('\n')

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;background:#0a0a0f;color:#ffffff;padding:24px;">
      <p style="color:#D4AF37;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Echo on-call</p>
      <h1 style="font-size:18px;margin:8px 0 16px;">${escapeHtml(String(pending.length))} unresolved after ${minutes}m</h1>
      <p style="color:#a0a0b8;font-size:13px;">Knights + auto-send did not clear these Echo silent-radio tickets.</p>
      <ul style="padding-left:18px;color:#a0a0b8;font-size:13px;">
        ${lines.map((l) => `<li style="margin:0 0 6px;">${escapeHtml(l)}</li>`).join('')}
      </ul>
    </div>
  `

  const send = await sendEmail({ to, subject, text, html })
  if (!send.ok) {
    await audit('computer_agent', 'ops.echo_oncall.fail', undefined, {
      count: pending.length,
      reason: send.reason,
    })
    return {
      minutes,
      since: since.toISOString(),
      to,
      emailed: false,
      skippedReason: 'send_failed',
      count: pending.length,
      ticketIds: pending.map((t) => t.id),
      label: '✕ Echo on-call email failed',
    }
  }

  for (const t of pending) {
    await audit('computer_agent', 'ops.echo_oncall.page', t.id, {
      minutes,
      clientKey: t.clientKey,
      status: t.status,
      moduleHint: t.moduleHint,
      why: 'unresolved_past_oncall_window',
    })
  }

  return {
    minutes,
    since: since.toISOString(),
    to,
    emailed: true,
    count: pending.length,
    ticketIds: pending.map((t) => t.id),
    label: `⚠ Echo on-call emailed · ${pending.length} ticket(s)`,
  }
}
