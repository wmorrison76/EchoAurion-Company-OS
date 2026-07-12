import { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
import { getAllRepoHealth } from '@/lib/github'
import { getRenderDeployHealth } from '@/lib/render'
import { getStripeMRRHealth } from '@/lib/stripe'
import { isEmailConfigured } from '@/lib/email'
import { knightConfigured, ROSTER } from '@/lib/board-room/knights'
import type {
  ActiveUsersHealth,
  DrOsStatus,
  NeonHealth,
  PilotConnectionHealth,
  PilotHealth,
} from '@/types/dr-os'
import { getStandbyConfig } from '@/lib/standby'

const DAY_MS = 24 * 60 * 60 * 1000

function dbName(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).pathname.replace(/^\//, '') || null
  } catch {
    return null
  }
}

export async function checkNeon(): Promise<NeonHealth> {
  const start = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return {
      level: 'ok',
      label: 'Connected',
      responseMs: Date.now() - start,
      database: dbName(process.env.DATABASE_URL),
    }
  } catch (error) {
    return {
      level: 'error',
      label: 'Error',
      responseMs: null,
      database: dbName(process.env.DATABASE_URL),
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

export async function getPilot(): Promise<PilotHealth> {
  try {
    const pilot = await db.pilot.findFirst({ orderBy: { createdAt: 'asc' } })
    if (!pilot) {
      return {
        level: 'unknown',
        name: 'Miccosukee',
        stage: 'UNKNOWN',
        daysSinceContact: null,
        notes: null,
        error: 'No pilot record',
      }
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
    const echoAiConfigured = Boolean(process.env.ECHO_AI_URL?.trim())
    const chefsBrainConfigured = knightConfigured(ROSTER.chefs_brain)

    let level: PilotConnectionHealth['level'] = 'unknown'
    let label = 'Unknown'
    if (!supportIngestSecretConfigured) {
      level = 'error'
      label = 'Secret missing'
    } else if (onlineCount > 0) {
      level = 'ok'
      label = 'Healthy'
    } else if (clients.length > 0) {
      level =
        lastHeartbeatAgeMs != null && lastHeartbeatAgeMs > STALE_MS
          ? 'warn'
          : 'warn'
      label = 'Offline'
    } else {
      level = 'warn'
      label = 'No pilots'
    }
    if (supportIngestSecretConfigured && !echoAiConfigured && level === 'ok') {
      level = 'warn'
      label = 'Echo AI unset'
    }

    return {
      level,
      label,
      onlineCount,
      totalClients: clients.length,
      streamCount,
      standbyMode: standby.mode,
      standbyReviewCount: reviewCount,
      supportIngestSecretConfigured,
      emailConfigured,
      echoAiConfigured,
      chefsBrainConfigured,
      lastHeartbeatAgeMs,
      lastQuestionAgeMs: lastQuestion
        ? now - lastQuestion.createdAt.getTime()
        : null,
      pendingOutbox,
    }
  } catch (error) {
    return {
      level: 'unknown',
      label: 'Unknown',
      onlineCount: 0,
      totalClients: 0,
      streamCount: 0,
      standbyMode: 'off',
      standbyReviewCount: 0,
      supportIngestSecretConfigured: Boolean(
        process.env.SUPPORT_INGEST_SECRET?.trim()
      ),
      emailConfigured: isEmailConfigured(),
      echoAiConfigured: Boolean(process.env.ECHO_AI_URL?.trim()),
      chefsBrainConfigured: knightConfigured(ROSTER.chefs_brain),
      lastHeartbeatAgeMs: null,
      lastQuestionAgeMs: null,
      pendingOutbox: 0,
      error: error instanceof Error ? error.message : 'Pilot connection query failed',
    }
  }
}

/** Runs every Dr. OS status check in parallel (CLAUDE.md §10.4). */
export async function getDrOsStatus(): Promise<DrOsStatus> {
  const [github, render, neon, stripe, activeUsers, pilot, pilotConnection] = await Promise.all([
    getAllRepoHealth(),
    getRenderDeployHealth(),
    checkNeon(),
    getStripeMRRHealth(),
    getActiveUsers(),
    getPilot(),
    getPilotConnection(),
  ])
  return {
    github,
    render,
    neon,
    stripe,
    activeUsers,
    pilot,
    pilotConnection,
    generatedAt: new Date().toISOString(),
  }
}
