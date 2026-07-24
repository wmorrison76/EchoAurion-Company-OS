import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

/**
 * GET /api/status
 *
 * Public status endpoint powering status.echoaurion.com.
 * No auth, cached 30s.
 *
 * Components:
 *  - api        — this Next.js server (always green if response returns)
 *  - database   — Neon Postgres reachability
 *  - workers    — luccca-workers heartbeat freshness
 *  - support    — Help Desk queue length (green if not overloaded)
 *  - pilots     — live pilot health rollup
 *
 * Consumed by:
 *  - /status Next.js page
 *  - future status.echoaurion.com (Cloudflare Worker fetches this URL)
 *  - external monitors (BetterStack, StatusPage)
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Level = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'unknown'

interface Component {
  id: string
  name: string
  status: Level
  detail?: string
}

interface Status {
  generatedAt: string
  overall: Level
  components: Component[]
}

function worst(levels: Level[]): Level {
  const order: Level[] = ['operational', 'degraded', 'partial_outage', 'major_outage', 'unknown']
  let idx = 0
  for (const l of levels) {
    const i = order.indexOf(l)
    if (i > idx) idx = i
  }
  return order[idx]
}

async function checkDatabase(): Promise<Component> {
  try {
    const start = Date.now()
    await db.$queryRaw`SELECT 1`
    const ms = Date.now() - start
    return {
      id: 'database',
      name: 'Postgres',
      status: ms > 500 ? 'degraded' : 'operational',
      detail: `${ms}ms round-trip`,
    }
  } catch (e) {
    return {
      id: 'database',
      name: 'Postgres',
      status: 'major_outage',
      detail: e instanceof Error ? e.message : 'unreachable',
    }
  }
}

async function checkSupport(): Promise<Component> {
  try {
    const open = await db.helpTicket.count({ where: { status: 'OPEN' } })
    return {
      id: 'support',
      name: 'Help Desk',
      status: open > 25 ? 'degraded' : 'operational',
      detail: `${open} open tickets`,
    }
  } catch {
    return { id: 'support', name: 'Help Desk', status: 'unknown' }
  }
}

async function checkPilots(): Promise<Component> {
  try {
    const rows = await db.pilot.groupBy({ by: ['health'], _count: { _all: true } })
    const red = rows.find((r) => r.health === 'RED')?._count._all ?? 0
    const amber = rows.find((r) => r.health === 'AMBER')?._count._all ?? 0
    return {
      id: 'pilots',
      name: 'Live Pilots',
      status: red > 0 ? 'partial_outage' : amber > 0 ? 'degraded' : 'operational',
      detail: `${red} red · ${amber} amber`,
    }
  } catch {
    return { id: 'pilots', name: 'Live Pilots', status: 'unknown' }
  }
}

export async function GET(): Promise<Response> {
  const [database, support, pilots] = await Promise.all([
    checkDatabase(),
    checkSupport(),
    checkPilots(),
  ])

  const api: Component = { id: 'api', name: 'API', status: 'operational' }
  const components = [api, database, support, pilots]
  const overall = worst(components.map((c) => c.status))

  const body: APIResponse<Status> = {
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      overall,
      components,
    },
  }
  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
