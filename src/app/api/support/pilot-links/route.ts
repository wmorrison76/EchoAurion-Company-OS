import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getStandbyConfig } from '@/lib/standby'
import type { APIResponse } from '@/types'
import type { ClientHealth } from '@/types/support'

export const dynamic = 'force-dynamic'

const ONLINE_MS = 5 * 60 * 1000 // heartbeat within 5 min = online
const STREAM_MS = 2 * 60 * 1000 // stream touch within 2 min = connected

export interface PilotLinkView {
  id: string
  clientKey: string
  label: string
  property: string | null
  health: ClientHealth
  lastHeartbeatAt: string | null
  lastStreamAt: string | null
  online: boolean
  streamConnected: boolean
  pendingOutbox: number
}

export interface PilotLinksPayload {
  clients: PilotLinkView[]
  onlineCount: number
  streamCount: number
  standbyMode: string
  standbyReviewCount: number
}

/**
 * GET /api/support/pilot-links — operator connection status for all pilots.
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const now = Date.now()
    const [clients, standby, reviewCount, outboxCounts] = await Promise.all([
      db.supportClient.findMany({ orderBy: { updatedAt: 'desc' } }),
      getStandbyConfig(),
      db.customerQuestion.count({
        where: { standbyApproved: true, answeredAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } },
      }),
      db.relayOutbox.groupBy({
        by: ['clientKey'],
        where: { deliveredAt: null },
        _count: { _all: true },
      }),
    ])

    const pendingByKey = new Map(outboxCounts.map((r) => [r.clientKey, r._count._all]))

    const views: PilotLinkView[] = clients.map((c) => {
      const hb = c.lastHeartbeatAt?.getTime() ?? 0
      const st = c.lastStreamAt?.getTime() ?? 0
      return {
        id: c.id,
        clientKey: c.clientKey,
        label: c.label,
        property: c.property,
        health: (c.lastHealth as ClientHealth) ?? 'UNKNOWN',
        lastHeartbeatAt: c.lastHeartbeatAt?.toISOString() ?? null,
        lastStreamAt: c.lastStreamAt?.toISOString() ?? null,
        online: hb > 0 && now - hb < ONLINE_MS,
        streamConnected: st > 0 && now - st < STREAM_MS,
        pendingOutbox: pendingByKey.get(c.clientKey) ?? 0,
      }
    })

    const data: PilotLinksPayload = {
      clients: views,
      onlineCount: views.filter((v) => v.online).length,
      streamCount: views.filter((v) => v.streamConnected).length,
      standbyMode: standby.mode,
      standbyReviewCount: reviewCount,
    }

    return Response.json({ success: true, data } satisfies APIResponse<PilotLinksPayload>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Pilot links query failed',
      },
      { status: 500 }
    )
  }
}
