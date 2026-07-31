/**
 * Compact Dr. OS ops chips — Night Cleaner, HelpEval Friday, cost anomaly.
 * Counts / scores only — no PII, no secret values.
 */

import { db } from '@/lib/db'
import { ingestQueueStats } from '@/lib/ingest-queue'
import { latestEvalRun } from '@/lib/help-eval'
import type { StatusLevel } from '@/types'
import type { DrainHealthSnapshot } from '@/types/drain-health'
import type {
  CostAnomalyChipSnapshot,
  HelpEvalChipSnapshot,
  NightCleanerChipSnapshot,
} from '@/types/ops-chips'

const DAY_MS = 24 * 60 * 60 * 1000
const NIGHT_CLEANER_STALE_H = 36
const HELP_EVAL_STALE_H = 8 * 24 // ~weekly cron — stale after 8 days
const COST_SCAN_STALE_H = 36

function minutesSince(at: Date | null): number | null {
  if (!at) return null
  return Math.round((Date.now() - at.getTime()) / 60_000)
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>
  }
  return {}
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** Dead-letter / ingest-drain health (shared by chip + System Status rollup). */
export async function getDrainHealth(): Promise<DrainHealthSnapshot> {
  const stuckCutoff = new Date(Date.now() - 5 * 60_000)

  const [stats, stuckOutbox, lastPoll, lastDrain, lastKnightDrain] = await Promise.all([
    ingestQueueStats(),
    db.relayOutbox.count({
      where: { deliveredAt: null, createdAt: { lt: stuckCutoff } },
    }),
    db.auditLog.findFirst({
      where: { action: 'ops.poll_failures' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.auditLog.findFirst({
      where: { action: { in: ['ops.drain_queue', 'ops.poll_failures'] } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.auditLog.findFirst({
      where: { action: 'ops.drain_knight_queue' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  const knightRunning = await db.ingestJob.count({
    where: { status: 'RUNNING', kind: 'text_knights' },
  })

  const lastDrainAt = lastDrain?.createdAt ?? null
  const minutesSinceLastDrain = minutesSince(lastDrainAt)
  const lastKnightDrainAt = lastKnightDrain?.createdAt ?? null
  const minutesSinceKnightDrain = minutesSince(lastKnightDrainAt)
  const systemDrainStale = minutesSinceLastDrain == null || minutesSinceLastDrain > 20
  const knightDrainStale = minutesSinceKnightDrain == null || minutesSinceKnightDrain > 3
  const backlog =
    stats.pending > 50 ||
    stats.failed > 0 ||
    stuckOutbox > 0 ||
    stats.knightPending > 50

  let level: StatusLevel = 'ok'
  let shape = '✓'
  let label = 'Drain healthy'
  if (stats.failed > 0 || stuckOutbox > 5) {
    level = 'error'
    shape = '✕'
    label = 'Dead-letter backlog'
  } else if (knightDrainStale && stats.knightPending > 0) {
    level = 'warn'
    shape = '⚠'
    label =
      minutesSinceKnightDrain == null
        ? 'Knight drain never ran'
        : 'Knight drain stale · backlog'
  } else if (stats.knightPending > 50) {
    level = 'warn'
    shape = '⚠'
    label = `Knight backlog · ${stats.knightPending} pending`
  } else if (systemDrainStale) {
    level = 'warn'
    shape = '⚠'
    label = minutesSinceLastDrain == null ? 'Drain never ran' : 'Drain cron stale'
  } else if (backlog) {
    level = 'warn'
    shape = '⚠'
    label = 'Queue backlog'
  }

  return {
    pending: stats.pending,
    running: stats.running,
    failed: stats.failed,
    stuckOutbox,
    knightPending: stats.knightPending,
    knightRunning,
    lastPollAt: lastPoll?.createdAt.toISOString() ?? null,
    lastDrainAt: lastDrainAt?.toISOString() ?? null,
    minutesSinceLastDrain,
    lastKnightDrainAt: lastKnightDrainAt?.toISOString() ?? null,
    minutesSinceKnightDrain,
    level,
    shape,
    label,
  }
}

/** Last Night Cleaner Morning Open ingest (audit + ticket link). */
export async function getNightCleanerChip(): Promise<NightCleanerChipSnapshot> {
  const [ingest, openTicket] = await Promise.all([
    db.auditLog.findFirst({
      where: { action: 'ops.night_cleaner.ingest' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, entityId: true, payload: true },
    }),
    db.helpTicket.findFirst({
      where: {
        moduleHint: 'night-cleaner',
        status: { in: ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, subject: true, priority: true, updatedAt: true },
    }),
  ])

  if (!ingest) {
    return {
      level: 'unknown',
      shape: '?',
      label: 'No night report yet',
      score: null,
      taskCount: null,
      productLine: null,
      ticketId: openTicket?.id ?? null,
      ingestedAt: null,
      minutesSinceIngest: null,
      stale: true,
    }
  }

  const p = asRecord(ingest.payload)
  const status = str(p.status) ?? 'unknown'
  const score = num(p.score)
  const taskCount = num(p.taskCount)
  const productLine = str(p.productLine)
  const ticketId = ingest.entityId ?? openTicket?.id ?? null
  const mins = minutesSince(ingest.createdAt)
  const stale = mins == null || mins > NIGHT_CLEANER_STALE_H * 60

  let level: StatusLevel = 'ok'
  let shape = '✓'
  if (status === 'error') {
    level = 'error'
    shape = '✕'
  } else if (status === 'warn' || stale) {
    level = 'warn'
    shape = '▲'
  } else if (status === 'ok') {
    level = 'ok'
    shape = '✓'
  } else {
    level = 'unknown'
    shape = '?'
  }

  const scoreBit = score != null ? ` ${score}/100` : ''
  const taskBit = taskCount != null ? ` · ${taskCount} tasks` : ''
  const staleBit = stale ? ' · stale' : ''
  const label = `${shape} Last night${scoreBit}${taskBit}${staleBit}`

  return {
    level,
    shape,
    label,
    score,
    taskCount,
    productLine,
    ticketId,
    ingestedAt: ingest.createdAt.toISOString(),
    minutesSinceIngest: mins,
    stale,
  }
}

/** Latest HelpEval run — prefer Friday cron marker when present. */
export async function getHelpEvalChip(): Promise<HelpEvalChipSnapshot> {
  const [fridayAudit, latest] = await Promise.all([
    db.auditLog.findFirst({
      where: { action: 'ops.help_eval_friday' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, entityId: true, payload: true },
    }),
    latestEvalRun(),
  ])

  const fridayPayload = fridayAudit ? asRecord(fridayAudit.payload) : null
  const useFriday =
    fridayAudit &&
    latest &&
    fridayAudit.entityId === latest.runId &&
    fridayAudit.createdAt.getTime() >= new Date(latest.createdAt).getTime() - 60_000

  const score = useFriday
    ? num(fridayPayload?.score) ?? latest?.score ?? null
    : latest?.score ?? null
  const passed = useFriday
    ? num(fridayPayload?.passed) ?? latest?.passed ?? null
    : latest?.passed ?? null
  const total = useFriday
    ? num(fridayPayload?.total) ?? latest?.total ?? null
    : latest?.total ?? null
  const ranAt = useFriday
    ? fridayAudit!.createdAt
    : latest
      ? new Date(latest.createdAt)
      : null
  const runId = useFriday ? fridayAudit!.entityId : latest?.runId ?? null
  const fridaySimulation = Boolean(useFriday || fridayPayload?.fridaySimulation)
  const mins = minutesSince(ranAt)
  const stale = mins == null || mins > HELP_EVAL_STALE_H * 60

  if (score == null || ranAt == null) {
    return {
      level: 'unknown',
      shape: '?',
      label: 'HelpEval never ran',
      score: null,
      passed: null,
      total: null,
      runId: null,
      fridaySimulation: false,
      ranAt: null,
      minutesSinceRun: null,
      stale: true,
    }
  }

  let level: StatusLevel = 'ok'
  let shape = '✓'
  if (score < 70) {
    level = 'error'
    shape = '✕'
  } else if (score < 90 || stale) {
    level = 'warn'
    shape = '▲'
  }

  const fri = fridaySimulation ? 'Friday ' : ''
  const label = stale
    ? `${shape} ${fri}HelpEval ${score}% · stale`
    : `${shape} ${fri}HelpEval ${score}%`

  return {
    level,
    shape,
    label,
    score,
    passed,
    total,
    runId,
    fridaySimulation,
    ranAt: ranAt.toISOString(),
    minutesSinceRun: mins,
    stale,
  }
}

/** Cost anomaly — open alerts + last scan audit. */
export async function getCostAnomalyChip(): Promise<CostAnomalyChipSnapshot> {
  const since24h = new Date(Date.now() - DAY_MS)

  const [openAlerts, lastScan] = await Promise.all([
    db.alert.count({
      where: {
        kind: 'system',
        entityRef: { startsWith: 'cost:' },
        read: false,
        createdAt: { gte: since24h },
      },
    }),
    db.auditLog.findFirst({
      where: {
        action: { in: ['ops.cost_anomaly', 'fleet.cost_anomaly.scan'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, payload: true },
    }),
  ])

  const p = lastScan ? asRecord(lastScan.payload) : {}
  const anomalyCount = num(p.anomalyCount) ?? num(p.anomalies)
  const mins = minutesSince(lastScan?.createdAt ?? null)
  const stale = mins == null || mins > COST_SCAN_STALE_H * 60

  let level: StatusLevel = 'ok'
  let shape = '✓'
  let label = 'Cost clear'

  if (openAlerts > 0) {
    level = 'warn'
    shape = '▲'
    label = `Cost anomaly · ${openAlerts} open`
  } else if (!lastScan) {
    level = 'unknown'
    shape = '?'
    label = 'Cost scan never ran'
  } else if (stale) {
    level = 'warn'
    shape = '▲'
    label = 'Cost scan stale'
  } else if (anomalyCount != null && anomalyCount > 0) {
    level = 'warn'
    shape = '▲'
    label = `Cost · ${anomalyCount} hit(s) last scan`
  } else {
    label = '✓ Cost clear'
  }

  return {
    level,
    shape,
    label,
    openAlerts,
    lastScanAt: lastScan?.createdAt.toISOString() ?? null,
    minutesSinceScan: mins,
    lastAnomalyCount: anomalyCount,
    stale,
  }
}
