/**
 * Periodic email digest of Help Desk / Echo / SYSTEM fixes for William.
 * Invoked by POST /api/ops/fix-digest (Render cron every FIX_DIGEST_HOURS).
 */

import { db } from '@/lib/db'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { redactSensitive } from '@/lib/error-redact'
import { audit } from '@/lib/audit'

export type FixDigestResult = {
  hours: number
  since: string
  to: string | null
  emailed: boolean
  skippedReason?: 'email_not_configured' | 'no_recipient' | 'send_failed' | 'empty'
  counts: {
    helpDeskResolved: number
    systemResolved: number
    echoRepairReady: number
    approvedSends: number
    otherFixes: number
  }
  label: string
}

function digestHours(): number {
  const raw = Number(process.env.FIX_DIGEST_HOURS ?? '4')
  if (!Number.isFinite(raw) || raw < 1) return 4
  return Math.min(raw, 168)
}

function digestTo(): string | null {
  return (
    process.env.FIX_DIGEST_TO?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    null
  )
}

const APPROVE_ACTIONS = [
  'help_desk.ticket.approve',
  'help_desk.client.send',
  'help_desk.client.send_article',
  'support.question.answer',
  'help_desk.error_event.resolved_flywheel',
]

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function listHtml(
  title: string,
  rows: Array<{ line: string }>
): string {
  if (rows.length === 0) {
    return `<p style="margin:12px 0 4px;font-size:12px;color:#5a5a78;">${escapeHtml(title)}: none</p>`
  }
  const items = rows
    .slice(0, 40)
    .map(
      (r) =>
        `<li style="margin:0 0 4px;font-size:13px;color:#a0a0b8;">${escapeHtml(r.line)}</li>`
    )
    .join('')
  return `
    <p style="margin:16px 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#D4AF37;">${escapeHtml(title)} (${rows.length})</p>
    <ul style="margin:0;padding-left:18px;">${items}</ul>
  `
}

export async function runFixDigest(): Promise<FixDigestResult> {
  const hours = digestHours()
  const since = new Date(Date.now() - hours * 3_600_000)
  const to = digestTo()

  const [resolved, systemResolved, repairs, approveAudits, fixAudits] =
    await Promise.all([
      db.helpTicket.findMany({
        where: {
          status: 'RESOLVED',
          resolvedAt: { gte: since },
          channel: { not: 'SYSTEM' },
        },
        orderBy: { resolvedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          subject: true,
          clientKey: true,
          channel: true,
          resolvedAt: true,
        },
      }),
      db.helpTicket.findMany({
        where: {
          status: 'RESOLVED',
          resolvedAt: { gte: since },
          channel: 'SYSTEM',
        },
        orderBy: { resolvedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          subject: true,
          clientKey: true,
          errorCategory: true,
          fingerprint: true,
          resolvedAt: true,
        },
      }),
      db.relayOutbox.findMany({
        where: {
          type: 'echo_repair_ready',
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          clientKey: true,
          createdAt: true,
          deliveredAt: true,
        },
      }),
      db.auditLog.findMany({
        where: {
          createdAt: { gte: since },
          action: { in: APPROVE_ACTIONS },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          actor: true,
          action: true,
          entityId: true,
          createdAt: true,
        },
      }),
      db.auditLog.findMany({
        where: {
          createdAt: { gte: since },
          OR: [
            { action: { contains: 'resolved' } },
            { action: { contains: 'repair' } },
            { action: { contains: 'runbook' } },
          ],
          NOT: { action: { in: APPROVE_ACTIONS } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          actor: true,
          action: true,
          entityId: true,
          createdAt: true,
        },
      }),
    ])

  const counts = {
    helpDeskResolved: resolved.length,
    systemResolved: systemResolved.length,
    echoRepairReady: repairs.length,
    approvedSends: approveAudits.length,
    otherFixes: fixAudits.length,
  }

  const total =
    counts.helpDeskResolved +
    counts.systemResolved +
    counts.echoRepairReady +
    counts.approvedSends +
    counts.otherFixes

  const label =
    total === 0
      ? `✓ Fix digest · ${hours}h · no activity`
      : `▲ Fix digest · ${hours}h · ${total} items`

  const base: FixDigestResult = {
    hours,
    since: since.toISOString(),
    to,
    emailed: false,
    counts,
    label,
  }

  if (!isEmailConfigured()) {
    console.info('[fix-digest] Email not configured — skipping send', {
      hours,
      total,
      counts,
    })
    return { ...base, skippedReason: 'email_not_configured' }
  }

  if (!to) {
    console.info('[fix-digest] No FIX_DIGEST_TO / ADMIN_EMAIL — skipping send')
    return { ...base, skippedReason: 'no_recipient' }
  }

  if (total === 0) {
    console.info('[fix-digest] No fixes in window — skipping email', { hours })
    await audit('computer_agent', 'ops.fix_digest', undefined, {
      hours,
      total: 0,
      emailed: false,
      reason: 'empty',
    }).catch(() => {})
    return { ...base, skippedReason: 'empty' }
  }

  const helpRows = resolved.map((t) => ({
    line: `${t.resolvedAt?.toISOString().slice(0, 16) ?? '?'} · ${redactSensitive(t.subject, 80)} · ${t.clientKey ?? '—'} · ${t.id.slice(0, 8)}`,
  }))
  const systemRows = systemResolved.map((t) => ({
    line: `${t.resolvedAt?.toISOString().slice(0, 16) ?? '?'} · ${redactSensitive(t.subject, 80)} · ${t.errorCategory ?? 'SYSTEM'} · ${t.id.slice(0, 8)}`,
  }))
  const repairRows = repairs.map((r) => ({
    line: `${r.createdAt.toISOString().slice(0, 16)} · echo_repair_ready → ${r.clientKey} · ${r.deliveredAt ? 'delivered' : 'pending'}`,
  }))
  const approveRows = approveAudits.map((a) => ({
    line: `${a.createdAt.toISOString().slice(0, 16)} · ${a.action} · ${a.actor} · ${a.entityId?.slice(0, 10) ?? '—'}`,
  }))
  const otherRows = fixAudits.map((a) => ({
    line: `${a.createdAt.toISOString().slice(0, 16)} · ${a.action} · ${a.actor}`,
  }))

  const subject = `[Dr. OS] Fix digest — last ${hours}h (${total} items)`
  const text = [
    `EchoAurion Company OS — fix digest (last ${hours} hours)`,
    `Since: ${since.toISOString()}`,
    '',
    `Help Desk resolved: ${counts.helpDeskResolved}`,
    `SYSTEM resolved: ${counts.systemResolved}`,
    `Echo repair_ready: ${counts.echoRepairReady}`,
    `Approved / sent: ${counts.approvedSends}`,
    `Other fix audits: ${counts.otherFixes}`,
    '',
    ...helpRows.map((r) => `HD: ${r.line}`),
    ...systemRows.map((r) => `SYS: ${r.line}`),
    ...repairRows.map((r) => `ECHO: ${r.line}`),
    ...approveRows.map((r) => `OK: ${r.line}`),
    '',
    '— Aurion Holdings / Dr. OS',
  ].join('\n')

  const html = `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#0a0a0f;color:#ffffff;font-family:Inter,system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#12121a;border:1px solid #2a2a3f;border-radius:12px;padding:28px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#D4AF37;">Dr. OS · Fix digest</p>
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#ffffff;">Last ${hours} hours</h1>
          <p style="margin:0 0 16px;font-size:13px;color:#a0a0b8;">Since ${escapeHtml(since.toISOString())}</p>
          <p style="margin:0;font-size:14px;color:#ffffff;font-family:ui-monospace,monospace;">
            HD ${counts.helpDeskResolved} · SYSTEM ${counts.systemResolved} · Echo ${counts.echoRepairReady} · Approved ${counts.approvedSends}
          </p>
          ${listHtml('Help Desk resolved', helpRows)}
          ${listHtml('SYSTEM fixes', systemRows)}
          ${listHtml('Echo repair_ready', repairRows)}
          ${listHtml('Approved / sent', approveRows)}
          ${listHtml('Other fix audits', otherRows)}
          <p style="margin:24px 0 0;font-size:11px;color:#5a5a78;">Open /dr-os → Audit Trail (filter Computer / Relay) for full payloads.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim()

  const send = await sendEmail({ to, subject, text, html })
  if (!send.ok) {
    console.error('[fix-digest] Send failed', send.reason, send.detail)
    await audit('computer_agent', 'ops.fix_digest', undefined, {
      hours,
      total,
      emailed: false,
      reason: send.reason,
      detail: send.detail ?? null,
    }).catch(() => {})
    return {
      ...base,
      skippedReason: send.reason === 'not_configured' ? 'email_not_configured' : 'send_failed',
    }
  }

  await audit('computer_agent', 'ops.fix_digest', undefined, {
    hours,
    total,
    emailed: true,
    toDomain: to.includes('@') ? to.split('@')[1] : null,
    counts,
  }).catch(() => {})

  console.info('[fix-digest] Sent', { hours, total, provider: send.provider })
  return { ...base, emailed: true }
}
