import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'
import type { ClientHealth, SupportClientView } from '@/types/support'

export const dynamic = 'force-dynamic'

// Admin-facing roster of product clients, each with its latest diagnostic.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const clients = await db.supportClient.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { snapshots: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    const now = Date.now()
    const data: SupportClientView[] = clients.map((c) => {
      const s = c.snapshots[0]
      const hb = c.lastHeartbeatAt
      const recentHb = hb != null && now - hb.getTime() < 5 * 60 * 1000
      return {
        id: c.id,
        clientKey: c.clientKey,
        label: c.label,
        property: c.property,
        health: (c.lastHealth as ClientHealth) ?? (s?.health as ClientHealth) ?? 'UNKNOWN',
        appVersion: s?.appVersion ?? null,
        platform: s?.platform ?? null,
        online: s?.online ?? recentHb,
        queueDepth: s?.queueDepth ?? 0,
        errorCount: s?.errorCount ?? 0,
        lastSyncAt: s?.lastSyncAt?.toISOString() ?? hb?.toISOString() ?? null,
        lastSeenAt: hb?.toISOString() ?? s?.createdAt.toISOString() ?? null,
      }
    })
    return Response.json({ success: true, data } satisfies APIResponse<SupportClientView[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Clients query failed' },
      { status: 500 }
    )
  }
}
