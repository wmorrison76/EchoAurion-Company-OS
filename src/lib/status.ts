import { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
import { getAllRepoHealth } from '@/lib/github'
import { getRenderDeployHealth } from '@/lib/render'
import { getStripeMRRHealth } from '@/lib/stripe'
import { isEmailConfigured } from '@/lib/email'
import {
  SUGGESTED_ECHO_AI_URL,
  echoAiKeyConfigured,
  echoAiUrlConfigured,
  probeChefsBrain,
} from '@/lib/echo-brain'
import {
  getCostAnomalyChip,
  getDrainHealth,
  getHelpEvalChip,
  getNightCleanerChip,
} from '@/lib/dr-os-chips'
import type {
  ActiveUsersHealth,
  DrOsStatus,
  NeonHealth,
  PilotConnectionHealth,
  PilotHealth,
} from '@/types/dr-os'
import { getStandbyConfig } from '@/lib/standby'
import { getConfigDebtSnapshot } from '@/lib/config-debt'

const MICCOSUKEE_PILOT = {
  name: 'Miccosukee',
  stage: 'ACTIVE',
  health: 'GREEN',
  notes: 'Active pilot — Miccosukee Resort & Gaming.',
} as const

const DAY_MS = 24 * 60 * 60 * 1000

function dbName(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).pathname.replace(/^\//, '') || null
  } catch {
    return null
  }
}

/** Neon / Prisma pool size hint from connection_limit query param when set. */
function poolSizeFromUrl(url: string | undefined): number | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const raw = u.searchParams.get('connection_limit')
    if (!raw) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export async function checkNeon(): Promise<NeonHealth> {
  const start = Date.now()
  const database = dbName(process.env.DATABASE_URL)
  const poolSize = poolSizeFromUrl(process.env.DATABASE_URL)
  try {
    await db.$queryRaw`SELECT 1`
    return {
      level: 'ok',
      label: 'Connected',
      responseMs: Date.now() - start,
      database,
      poolSize,
    }
  } catch (error) {
    return {
      level: 'error',
      label: 'Error',
      responseMs: null,
      database,
      poolSize,
      error: error instanceof Error ? error.message : 'Database unreachable',
    }
  }
}

// Read-only connection to the product DB (CLAUDE.md §10.2). Singleton so we do
// not exhaust connections; only created when the env var is present.
const globalForProduct = globalThis as unknown as { productDb?: PrismaClient }
function productClient(): PrismaClient | null {
  const url = process.env.PRODUCT_DATABASE_URL
  if (!url) return null
  if (!globalForProduct.productDb) {
    globalForProduct.productDb = new PrismaClient({ datasources: { db: { url } } })
  }
  return globalForProduct.productDb
}

export async function getActiveUsers(): Promise<ActiveUsersHealth> {
  const client = productClient()
  if (!client) {
    return {
      level: 'unknown',
      label: 'Not configured',
      count: null,
      updatedAt: null,
      error: 'PRODUCT_DATABASE_URL not set',
    }
  }
  try {
    const rows = await client.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM product.users WHERE last_seen > NOW() - INTERVAL '30 days'`
    )
    return {
      level: 'ok',
      label: '30-day active',
      count: rows[0]?.count ?? 0,
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      level: 'unknown',
      label: 'Unavailable',
      count: null,
      updatedAt: null,
      error: error instanceof Error ? error.message : 'Product DB query failed',
    }
  }
}

function pilotLevel(health: string): PilotHealth['level'] {
  const h = health.toUpperCase()
  if (h === 'GREEN') return 'ok'
  if (h === 'AMBER' || h === 'YELLOW') return 'warn'
  if (h === 'RED') return 'error'
  return 'unknown'
}

/** Ensure Miccosukee exists so Pilot panel never stuck on "No pilot record". */
async function ensureMiccosukeePilot() {
  const existing = await db.pilot.findFirst({
    where: { name: { equals: MICCOSUKEE_PILOT.name, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) return existing
  return db.pilot.create({
    data: {
      name: MICCOSUKEE_PILOT.name,
      stage: MICCOSUKEE_PILOT.stage,
      health: MICCOSUKEE_PILOT.health,
      notes: MICCOSUKEE_PILOT.notes,
      lastContact: new Date(),
    },
  })
}

export async function getPilot(): Promise<PilotHealth> {
  try {
    let pilot = await db.pilot.findFirst({ orderBy: { createdAt: 'asc' } })
    if (!pilot) {
      pilot = await ensureMiccosukeePilot()
    }
    return {
      level: pilotLevel(pilot.health),
      name: pilot.name,
      stage: pilot.stage,
      daysSinceContact: Math.floor((Date.now() - pilot.lastContact.getTime()) / DAY_MS),
      notes: pilot.notes,
    }
  } catch (error) {
    return {
      level: 'unknown',
      name: 'Miccosukee',
      stage: 'UNKNOWN',
      daysSinceContact: null,
      notes: null,
      error: error instanceof Error ? error.message : 'Pilot query failed',
    }
  }
}

/** Live SupportClient heartbeats for the Pilot Connection Hub card. */
async function getPilotConnection(): Promise<PilotConnectionHealth> {
  try {
    const now = Date.now()
    const ONLINE_MS = 5 * 60 * 1000
    const STREAM_MS = 2 * 60 * 1000
    const STALE_MS = 15 * 60 * 1000
    const [
      clients,
      standby,
      reviewCount,
      pendingOutbox,
      lastQuestion,
    ] = await Promise.all([
      db.supportClient.findMany({
        select: { lastHeartbeatAt: true, lastStreamAt: true },
      }),
      getStandbyConfig(),
      db.customerQuestion.count({
        where: {
          standbyApproved: true,
          answeredAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      db.relayOutbox.count({ where: { deliveredAt: null } }),
      db.customerQuestion.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])

    const heartbeats = clients
      .map((c) => c.lastHeartbeatAt?.getTime())
      .filter((t): t is number => typeof t === 'number')
    const newestHb = heartbeats.length ? Math.max(...heartbeats) : null
    const lastHeartbeatAgeMs = newestHb != null ? now - newestHb : null
    const onlineCount = heartbeats.filter((t) => now - t < ONLINE_MS).length
    const streamCount = clients.filter(
      (c) => c.lastStreamAt && now - c.lastStreamAt.getTime() < STREAM_MS
    ).length

    const supportIngestSecretConfigured = Boolean(
      process.env.SUPPORT_INGEST_SECRET?.trim()
    )
    const emailConfigured = isEmailConfigured()
    const echoAiConfigured = echoAiUrlConfigured()
    const chefsProbe = await probeChefsBrain()
    const chefsBrainConfigured = chefsProbe.ok

    // Relay = secret + heartbeats only. Never call relay Offline because Brain unset.
    let relayLevel: PilotConnectionHealth['relayLevel'] = 'unknown'
    let relayLabel = 'Unknown'
    if (!supportIngestSecretConfigured) {
      relayLevel = 'error'
      relayLabel = 'Secret missing'
    } else if (onlineCount > 0) {
      relayLevel = 'ok'
      relayLabel = 'Relay OK'
    } else if (clients.length > 0) {
      relayLevel = 'warn'
      relayLabel =
        lastHeartbeatAgeMs != null && lastHeartbeatAgeMs > STALE_MS
          ? 'Relay stale'
          : 'Relay offline'
    } else {
      relayLevel = 'warn'
      relayLabel = 'No pilots'
    }

    let brainLevel: PilotConnectionHealth['brainLevel'] = 'unknown'
    let brainLabel = 'Unknown'
    if (!echoAiConfigured) {
      brainLevel = 'warn'
      brainLabel = "Chef's Brain unset"
    } else if (!chefsBrainConfigured) {
      brainLevel = 'error'
      brainLabel = "Chef's Brain down"
    } else {
      brainLevel = 'ok'
      brainLabel = "Chef's Brain OK"
    }

    // Card badge follows relay; Brain stays on its own BoolRow / brain badge.
    const level = relayLevel
    const label = relayLabel

    return {
      level,
      label,
      relayLevel,
      relayLabel,
      brainLevel,
      brainLabel,
      onlineCount,
      totalClients: clients.length,
      streamCount,
      standbyMode: standby.mode,
      standbyReviewCount: reviewCount,
      supportIngestSecretConfigured,
      emailConfigured,
      echoAiConfigured,
      chefsBrainConfigured,
      chefsBrainDetail: chefsProbe.detail,
      echoAiKeyConfigured: echoAiKeyConfigured(),
      suggestedEchoAiUrl: SUGGESTED_ECHO_AI_URL,
      lastHeartbeatAgeMs,
      lastQuestionAgeMs: lastQuestion
        ? now - lastQuestion.createdAt.getTime()
        : null,
      pendingOutbox,
    }
  } catch (error) {
    const chefsProbe = await probeChefsBrain().catch(() => ({
      ok: false,
      httpStatus: null,
      detail: 'probe skipped',
    }))
    const echoAiConfigured = echoAiUrlConfigured()
    const brainLevel: PilotConnectionHealth['brainLevel'] = !echoAiConfigured
      ? 'warn'
      : chefsProbe.ok
        ? 'ok'
        : 'error'
    const brainLabel = !echoAiConfigured
      ? "Chef's Brain unset"
      : chefsProbe.ok
        ? "Chef's Brain OK"
        : "Chef's Brain down"
    return {
      level: 'unknown',
      label: 'Unknown',
      relayLevel: 'unknown',
      relayLabel: 'Unknown',
      brainLevel,
      brainLabel,
      onlineCount: 0,
      totalClients: 0,
      streamCount: 0,
      standbyMode: 'off',
      standbyReviewCount: 0,
      supportIngestSecretConfigured: Boolean(
        process.env.SUPPORT_INGEST_SECRET?.trim()
      ),
      emailConfigured: isEmailConfigured(),
      echoAiConfigured,
      chefsBrainConfigured: chefsProbe.ok,
      chefsBrainDetail: chefsProbe.detail,
      echoAiKeyConfigured: echoAiKeyConfigured(),
      suggestedEchoAiUrl: SUGGESTED_ECHO_AI_URL,
      lastHeartbeatAgeMs: null,
      lastQuestionAgeMs: null,
      pendingOutbox: 0,
      error: error instanceof Error ? error.message : 'Pilot connection query failed',
    }
  }
}

/** Runs every Dr. OS status check in parallel (CLAUDE.md §10.4). */
export async function getDrOsStatus(): Promise<DrOsStatus> {
  const [
    github,
    render,
    neon,
    stripe,
    activeUsers,
    pilot,
    pilotConnection,
    drain,
    nightCleaner,
    helpEval,
    costAnomaly,
  ] = await Promise.all([
    getAllRepoHealth(),
    getRenderDeployHealth(),
    checkNeon(),
    getStripeMRRHealth(),
    getActiveUsers(),
    getPilot(),
    getPilotConnection(),
    getDrainHealth(),
    getNightCleanerChip(),
    getHelpEvalChip(),
    getCostAnomalyChip(),
  ])
  const base = {
    github,
    render,
    neon,
    stripe,
    activeUsers,
    pilot,
    pilotConnection,
    drain,
    nightCleaner,
    helpEval,
    costAnomaly,
    generatedAt: new Date().toISOString(),
  }
  // Config debt after panels resolve — daily SYSTEM ticket for William (no Knights).
  const configDebt = await getConfigDebtSnapshot(base, { openTicket: true })
  return { ...base, configDebt }
}
