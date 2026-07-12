/**
 * Anonymized system health snapshot for conflict detection / Board Room context.
 * NEVER include guest PII, emails, names, room numbers, or Authorization headers.
 *
 * Allowed: versions, error counts, queue depth, deploy status, drift, config booleans,
 * aggregate ages, outbox depth, health labels.
 * Forbidden: guest identity, emails, phone, messages body, Authorization, secrets.
 */

import { db } from '@/lib/db'
import { isEmailConfigured } from '@/lib/email'
import { knightConfigured, ROSTER } from '@/lib/board-room/knights'
import { getRenderDeployHealth } from '@/lib/render'
import { checkNeon } from '@/lib/status'
import { getStandbyConfig } from '@/lib/standby'
import type { StatusLevel } from '@/types'
import type { Prisma } from '@prisma/client'

export const SNAPSHOT_ALLOWED_FIELDS = [
  'versions',
  'errorCounts',
  'queueDepth',
  'deployStatus',
  'drift',
  'configBooleans',
  'heartbeatAgeMs',
  'outboxPending',
  'healthLabels',
  'clientCount',
] as const

export const SNAPSHOT_FORBIDDEN_FIELDS = [
  'guestName',
  'guestEmail',
  'email',
  'phone',
  'roomNumber',
  'authorization',
  'accessToken',
  'password',
  'question',
  'answer',
  'messageBody',
  'requesterName',
  'requesterEmail',
] as const

export interface AnonymizedSystemSnapshot {
  version: 1
  capturedAt: string
  health: 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN'
  level: StatusLevel
  label: string
  config: {
    supportIngestSecretConfigured: boolean
    emailConfigured: boolean
    echoAiConfigured: boolean
    chefsBrainConfigured: boolean
  }
  fleet: {
    supportClientCount: number
    onlineCount: number
    lastHeartbeatAgeMs: number | null
    pendingOutbox: number
    totalErrorCount: number
    totalQueueDepth: number
    latestAppVersion: string | null
    latestPlatform: string | null
  }
  questions: {
    lastReceivedAgeMs: number | null
    openCount: number
  }
  deploy: {
    label: string
    level: StatusLevel
    deployId: string | null
  }
  neon: {
    label: string
    responseMs: number | null
  }
  standbyMode: string
  /** Drift signals — config/runtime mismatches (booleans only). */
  drift: {
    ingestSecretMissing: boolean
    noRecentHeartbeat: boolean
    outboxBacklog: boolean
    echoAiMissing: boolean
  }
}

const ONLINE_MS = 5 * 60 * 1000
const STALE_HEARTBEAT_MS = 15 * 60 * 1000

function overallHealth(
  snap: Omit<AnonymizedSystemSnapshot, 'health' | 'level' | 'label'>
): Pick<AnonymizedSystemSnapshot, 'health' | 'level' | 'label'> {
  if (!snap.config.supportIngestSecretConfigured) {
    return { health: 'RED', level: 'error', label: 'Ingest secret missing' }
  }
  if (snap.drift.noRecentHeartbeat && snap.fleet.supportClientCount > 0) {
    return { health: 'AMBER', level: 'warn', label: 'Heartbeat stale' }
  }
  if (snap.fleet.supportClientCount === 0) {
    return { health: 'AMBER', level: 'warn', label: 'No pilots yet' }
  }
  if (snap.deploy.level === 'error' || snap.neon.label === 'Error') {
    return { health: 'RED', level: 'error', label: 'Infra error' }
  }
  if (snap.drift.outboxBacklog || snap.drift.echoAiMissing) {
    return { health: 'AMBER', level: 'warn', label: 'Partial' }
  }
  if (snap.fleet.onlineCount > 0) {
    return { health: 'GREEN', level: 'ok', label: 'Healthy' }
  }
  return { health: 'AMBER', level: 'warn', label: 'Offline' }
}

/** Build anonymized health payload — safe for Knights / conflict detection. */
export async function buildAnonymizedSnapshot(): Promise<AnonymizedSystemSnapshot> {
  const now = Date.now()
  const [
    clients,
    pendingOutbox,
    lastQuestion,
    openQuestions,
    latestSnaps,
    render,
    neon,
    standby,
  ] = await Promise.all([
    db.supportClient.findMany({
      select: { lastHeartbeatAt: true },
    }),
    db.relayOutbox.count({ where: { deliveredAt: null } }),
    db.customerQuestion.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.customerQuestion.count({ where: { answeredAt: null } }),
    db.diagnosticSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        appVersion: true,
        platform: true,
        errorCount: true,
        queueDepth: true,
        createdAt: true,
        clientId: true,
      },
    }),
    getRenderDeployHealth(),
    checkNeon(),
    getStandbyConfig(),
  ])

  const heartbeats = clients
    .map((c) => c.lastHeartbeatAt?.getTime())
    .filter((t): t is number => typeof t === 'number')
  const newestHb = heartbeats.length ? Math.max(...heartbeats) : null
  const lastHeartbeatAgeMs = newestHb != null ? now - newestHb : null
  const onlineCount = heartbeats.filter((t) => now - t < ONLINE_MS).length

  // Latest snapshot per client (first occurrence in desc list)
  const seen = new Set<string>()
  let totalErrorCount = 0
  let totalQueueDepth = 0
  let latestAppVersion: string | null = null
  let latestPlatform: string | null = null
  for (const s of latestSnaps) {
    if (seen.has(s.clientId)) continue
    seen.add(s.clientId)
    totalErrorCount += s.errorCount
    totalQueueDepth += s.queueDepth
    if (!latestAppVersion && s.appVersion) latestAppVersion = s.appVersion
    if (!latestPlatform && s.platform) latestPlatform = s.platform
  }

  const supportIngestSecretConfigured = Boolean(process.env.SUPPORT_INGEST_SECRET?.trim())
  const echoAiConfigured = Boolean(process.env.ECHO_AI_URL?.trim())
  const chefsBrainConfigured = knightConfigured(ROSTER.chefs_brain)

  const base = {
    version: 1 as const,
    capturedAt: new Date().toISOString(),
    config: {
      supportIngestSecretConfigured,
      emailConfigured: isEmailConfigured(),
      echoAiConfigured,
      chefsBrainConfigured,
    },
    fleet: {
      supportClientCount: clients.length,
      onlineCount,
      lastHeartbeatAgeMs,
      pendingOutbox,
      totalErrorCount,
      totalQueueDepth,
      latestAppVersion,
      latestPlatform,
    },
    questions: {
      lastReceivedAgeMs: lastQuestion ? now - lastQuestion.createdAt.getTime() : null,
      openCount: openQuestions,
    },
    deploy: {
      label: render.label,
      level: render.level,
      deployId: render.deployId,
    },
    neon: {
      label: neon.label,
      responseMs: neon.responseMs,
    },
    standbyMode: standby.mode,
    drift: {
      ingestSecretMissing: !supportIngestSecretConfigured,
      noRecentHeartbeat:
        clients.length > 0 &&
        (lastHeartbeatAgeMs == null || lastHeartbeatAgeMs > STALE_HEARTBEAT_MS),
      outboxBacklog: pendingOutbox > 10,
      echoAiMissing: !echoAiConfigured,
    },
  }

  const overall = overallHealth(base)
  return { ...base, ...overall }
}

export async function persistSystemSnapshot(opts: {
  actor: 'william_morrison' | 'computer_agent'
  source?: string
  sendToKnights?: boolean
}): Promise<{ id: string; snapshot: AnonymizedSystemSnapshot }> {
  const snapshot = await buildAnonymizedSnapshot()
  const row = await db.systemSnapshot.create({
    data: {
      source: opts.source ?? 'operator',
      health: snapshot.health,
      payload: snapshot as unknown as Prisma.InputJsonValue,
      sentToKnights: Boolean(opts.sendToKnights),
      actor: opts.actor,
    },
  })

  if (opts.sendToKnights) {
    // Sandbox Board Room context — store as briefing row; no production writes beyond this.
    await db.boardBriefing.create({
      data: {
        headline: `System snapshot · ${snapshot.label} · ${snapshot.health}`,
        snapshot: {
          kind: 'system_health',
          sandbox: true,
          ...snapshot,
        } as unknown as Prisma.InputJsonValue,
      },
    })
  }

  return { id: row.id, snapshot }
}

export function formatAgeMs(ms: number | null): string {
  if (ms == null) return 'never'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}
