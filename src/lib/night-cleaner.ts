/**
 * Night Cleaner Mole — ingest Morning Open reports into Help Desk as TASK tickets.
 * Never auto-merges. Never starts Knights by default. No PII expected in payload.
 * See docs/NIGHT_CLEANER_MOLE.md.
 */

import { createHash } from 'crypto'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { slaDueFieldsForCreate } from '@/lib/help-desk'
import { recordTimelineEvent } from '@/lib/help-timeline'
import { panelP95RegressionSignals } from '@/lib/echo-guardrails'
import type {
  NightCleanerIngestResult,
  NightCleanerReport,
  NightCleanerStatus,
  NightCleanerTask,
} from '@/types/night-cleaner'
import {
  NIGHT_CLEANER_SCHEMA_VERSION,
  statusToMorningLabel,
  statusToShape,
} from '@/types/night-cleaner'

const OPEN_STATUSES = ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] as const

function scrubLine(s: string, max = 200): string {
  return s
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/gi, '[redacted-email]')
    .replace(/\b(?:sk|pk|whsec|Bearer)[_-][A-Za-z0-9+/=._-]{8,}/gi, '[redacted-secret]')
    .slice(0, max)
}

function runDateUtc(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

export function nightCleanerFingerprint(
  report: NightCleanerReport,
  kind = 'night-cleaner'
): string {
  const day = runDateUtc(report.finishedAt || report.startedAt)
  const raw = `${kind}|${report.productLine}|${day}`
  return `nc-${createHash('sha256').update(raw).digest('hex').slice(0, 40)}`
}

function priorityForReport(report: NightCleanerReport): string {
  const guestError = report.tasks.some(
    (t) =>
      t.status === 'error' && (t.pathKind === 'guest' || t.pathKind === 'both')
  )
  if (guestError || report.overall.status === 'error') return 'HIGH'
  if (report.tasks.some((t) => t.status === 'error')) return 'HIGH'
  if (report.overall.status === 'warn') return 'NORMAL'
  return 'LOW'
}

function formatTaskLine(t: NightCleanerTask): string {
  const box = t.status === 'ok' ? '[x]' : '[ ]'
  return `${box} ${t.shape} ${scrubLine(t.title)} (${t.pathKind} · ${t.category})`
}

export function formatNightCleanerTicketBody(report: NightCleanerReport): string {
  const lines: string[] = [
    `Night cleaner · Morning open readiness · ${runDateUtc(report.finishedAt)}`,
    `Overall: ${report.overall.shape} ${report.overall.label} (${report.overall.score0to100}/100)`,
    `Source: ${report.source} · repo: ${scrubLine(report.repo, 80)} · sha: ${report.gitSha ?? 'n/a'}`,
    `Run: ${scrubLine(report.runId, 64)}`,
    '',
  ]

  if (report.telemetrySummary) {
    const t = report.telemetrySummary
    lines.push('Telemetry (counts only)')
    if (t.panelPassCount != null) {
      lines.push(
        `  panels ok=${t.panelOk ?? 0} slow=${t.panelSlow ?? 0} blank=${t.panelBlank ?? 0} timeout=${t.panelTimeout ?? 0} error=${t.panelError ?? 0}`
      )
    }
    if (t.errorEventCount != null) {
      lines.push(`  error events (${t.window ?? 'window'}): ${t.errorEventCount}`)
    }
    lines.push('')
  }

  for (const cat of report.categories) {
    const skip = cat.skipped ? ' · skipped' : ''
    lines.push(`${cat.title}${skip}`)
    lines.push(`  ${cat.overall.shape} ${cat.overall.label}`)
    for (const f of cat.findings.slice(0, 40)) {
      lines.push(`  ${f.shape} ${scrubLine(f.label)}${f.ref ? ` · ${scrubLine(f.ref, 80)}` : ''}`)
    }
    lines.push('')
  }

  lines.push('Tasks (do not auto-merge)')
  const tasks = report.tasks.length > 0 ? report.tasks : []
  if (tasks.length === 0) {
    lines.push('  ✓ No open tasks — morning open clear')
  } else {
    for (const t of tasks.slice(0, 80)) {
      lines.push(`  ${formatTaskLine(t)}`)
    }
  }

  if (report.systemImprovements && report.systemImprovements.length > 0) {
    lines.push('')
    lines.push('System improvements (day-shift task list — not auto-fixed overnight)')
    for (const item of report.systemImprovements.slice(0, 40)) {
      lines.push(`  · ${scrubLine(item, 200)}`)
    }
  }

  if (report.expandIdeas && report.expandIdeas.length > 0) {
    lines.push('')
    lines.push('Expand ideas')
    for (const idea of report.expandIdeas.slice(0, 20)) {
      lines.push(`  · ${scrubLine(idea, 160)}`)
    }
  }

  lines.push('')
  lines.push(
    'Policy: night cleaner leaves a morning-open task list only — no silent merges, no overnight remodel.'
  )
  return lines.join('\n')
}

function isReportShape(body: unknown): body is NightCleanerReport {
  if (!body || typeof body !== 'object') return false
  const r = body as Record<string, unknown>
  return (
    r.schemaVersion === NIGHT_CLEANER_SCHEMA_VERSION &&
    typeof r.runId === 'string' &&
    typeof r.repo === 'string' &&
    typeof r.productLine === 'string' &&
    r.overall != null &&
    typeof r.overall === 'object' &&
    Array.isArray(r.categories) &&
    Array.isArray(r.tasks)
  )
}

export function validateNightCleanerReport(
  body: unknown
): { ok: true; report: NightCleanerReport } | { ok: false; error: string } {
  if (!isReportShape(body)) {
    return {
      ok: false,
      error: 'Invalid NightCleanerReport — require schemaVersion:1, runId, repo, overall, categories, tasks',
    }
  }
  const overall = body.overall
  if (
    typeof overall.score0to100 !== 'number' ||
    typeof overall.status !== 'string' ||
    typeof overall.shape !== 'string' ||
    typeof overall.label !== 'string'
  ) {
    return { ok: false, error: 'overall must include status, shape, label, score0to100' }
  }
  return { ok: true, report: body }
}

/**
 * Ingest a night-cleaner report: dedupe by day fingerprint, create/update SYSTEM ticket.
 */
export async function ingestNightCleanerReport(
  report: NightCleanerReport,
  opts?: { createTicket?: boolean; fingerprintKind?: string }
): Promise<NightCleanerIngestResult> {
  const createTicket = opts?.createTicket !== false
  const fingerprintKind = opts?.fingerprintKind ?? 'night-cleaner'
  // Merge live panel p95 regression signals (anonymized) into morning report.
  const regressions = panelP95RegressionSignals()
  const enriched: NightCleanerReport =
    regressions.length === 0
      ? report
      : {
          ...report,
          categories: [
            ...report.categories,
            {
              id: 'panel_p95_regression',
              title: 'Panel p95 regression (Echo watch)',
              pathKind: 'operator',
              overall: {
                status: 'warn',
                shape: '▲',
                label: `▲ ${regressions.length} panel p95 regression(s)`,
              },
              findings: regressions.map((r, i) => ({
                id: `p95-${r.panelId}-${i}`,
                category: 'panel_p95_regression' as const,
                pathKind: 'operator' as const,
                status: 'warn' as const,
                shape: '▲' as const,
                label: r.label,
                ref: r.panelId,
                detail: `p95=${r.p95Ms}ms baselineFail=${r.baselineFailMs}ms`,
              })),
            },
          ],
          tasks: [
            ...report.tasks,
            ...regressions.map((r, i) => ({
              id: `task-p95-${r.panelId}-${i}`,
              title: r.label,
              status: 'warn' as const,
              shape: '▲' as const,
              label: r.label,
              pathKind: 'operator' as const,
              category: 'panel_p95_regression' as const,
              priorityHint: 'HIGH' as const,
              findingIds: [`p95-${r.panelId}-${i}`],
            })),
          ],
          systemImprovements: [
            ...(report.systemImprovements ?? []),
            ...regressions.map((r) => r.label),
          ],
        }

  const fingerprint = nightCleanerFingerprint(enriched, fingerprintKind)
  const body = formatNightCleanerTicketBody(enriched)
  const day = runDateUtc(enriched.finishedAt)
  const subject = scrubLine(
    fingerprintKind === 'stub-scan'
      ? `Stub / dead-end scan · ${day} · ${enriched.productLine}`
      : `Night cleaner · Morning open · ${day} · ${enriched.productLine}`,
    120
  )
  const priority = priorityForReport(enriched)

  let ticketId: string | null = null
  let ticketCreated = false

  if (createTicket) {
    const existing = await db.helpTicket.findFirst({
      where: {
        fingerprint,
        channel: 'SYSTEM',
        status: { in: [...OPEN_STATUSES] },
      },
      orderBy: { updatedAt: 'desc' },
    })

    if (existing) {
      ticketId = existing.id
      await db.helpTicket.update({
        where: { id: existing.id },
        data: {
          subject,
          priority,
          occurrenceCount: { increment: 1 },
          lastOccurredAt: new Date(),
          productLine: report.productLine,
          moduleHint: fingerprintKind === 'stub-scan' ? 'stub-scan' : 'night-cleaner',
          errorCategory: 'UI',
          agentWorking: false,
        },
      })
      await db.helpMessage.create({
        data: {
          ticketId: existing.id,
          role: 'SYSTEM',
          body: `Re-ingest ${report.runId}\n\n${body}`,
        },
      })
      await recordTimelineEvent({
        ticketId: existing.id,
        kind: 'detected',
        label: `${report.overall.shape} Night cleaner re-ingest`,
        detail: `run=${report.runId} score=${report.overall.score0to100} tasks=${report.tasks.length}`,
        actor: 'computer_agent',
        visibleToCustomer: false,
      })
    } else {
      const now = new Date()
      const dues = slaDueFieldsForCreate(now, 'TECH')
      const ticket = await db.helpTicket.create({
        data: {
          channel: 'SYSTEM',
          intakeGate: 'TECH',
          intakeChannel: 'IN_APP',
          status: 'OPEN',
          priority,
          subject,
          productLine: report.productLine,
          fingerprint,
          moduleHint: fingerprintKind === 'stub-scan' ? 'stub-scan' : 'night-cleaner',
          errorCategory: 'UI',
          errorScope: 'GLOBAL',
          clientKey: `ops/${fingerprintKind === 'stub-scan' ? 'stub-scan' : 'night-cleaner'}/${report.productLine}`,
          occurrenceCount: 1,
          lastOccurredAt: now,
          agentWorking: false,
          notifyWhenFixed: false,
          firstResponseDueAt: dues.firstResponseDueAt,
          resolveDueAt: dues.resolveDueAt,
          messages: {
            create: [{ role: 'SYSTEM', body }],
          },
        },
      })
      ticketId = ticket.id
      ticketCreated = true
      await recordTimelineEvent({
        ticketId: ticket.id,
        kind: 'detected',
        label: `${report.overall.shape} Night cleaner · morning open`,
        detail: `run=${report.runId} score=${report.overall.score0to100} tasks=${report.tasks.length} source=${report.source}`,
        actor: 'computer_agent',
        visibleToCustomer: false,
      })
    }
  }

  await audit('computer_agent', 'ops.night_cleaner.ingest', ticketId ?? report.runId, {
    runId: report.runId,
    productLine: report.productLine,
    score: report.overall.score0to100,
    status: report.overall.status,
    taskCount: report.tasks.length,
    ticketCreated,
    fingerprint,
  })

  const label = `${report.overall.shape} ${report.overall.label} · ${report.tasks.length} tasks`

  return {
    accepted: true,
    runId: report.runId,
    overall: report.overall,
    ticketId,
    ticketCreated,
    taskCount: report.tasks.length,
    label,
  }
}

/** Minimal empty report helper for local/dev dry-runs. */
export function emptyNightCleanerReport(
  partial: Pick<NightCleanerReport, 'runId' | 'repo' | 'productLine' | 'source' | 'environment'>
): NightCleanerReport {
  const now = new Date().toISOString()
  const status: NightCleanerStatus = 'ok'
  return {
    schemaVersion: 1,
    runId: partial.runId,
    startedAt: now,
    finishedAt: now,
    source: partial.source,
    productLine: partial.productLine,
    repo: partial.repo,
    environment: partial.environment,
    overall: {
      status,
      shape: statusToShape(status),
      label: statusToMorningLabel(status),
      score0to100: 100,
    },
    categories: [],
    tasks: [],
  }
}
