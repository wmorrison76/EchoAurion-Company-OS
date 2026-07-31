import { relayGuard, requireClientKey } from '@/lib/relay-auth'
import { audit } from '@/lib/audit'
import {
  productNexusSnapshotSchema,
  storeProductNexusSnapshot,
} from '@/lib/product-nexus'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/relay/nexus-snapshot — product internal service map (topology only).
 * Used by luccca-web cron or admin to enrich Fleet Nexus Deployment/Chain scopes.
 * No guest PII — nodes are services/datastores only.
 */
export async function POST(req: Request): Promise<Response> {
  const a = relayGuard(req, 'diagnostics')
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }

  try {
    const raw: unknown = await req.json()
    const parsed = productNexusSnapshotSchema.safeParse(raw)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid nexus snapshot payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }
    const key = requireClientKey(parsed.data.clientKey)
    if (!key.ok) {
      return Response.json(
        { success: false, error: key.error, code: key.code },
        { status: key.status }
      )
    }

    const id = await storeProductNexusSnapshot({
      ...parsed.data,
      clientKey: key.clientKey,
    })

    await audit('computer_agent', 'fleet.nexus_snapshot.ingest', id, {
      clientKey: key.clientKey,
      nodeCount: parsed.data.nodes.length,
      edgeCount: parsed.data.edges?.length ?? 0,
    })

    return Response.json({
      success: true,
      data: { id, clientKey: key.clientKey, nodeCount: parsed.data.nodes.length },
    } satisfies APIResponse<{ id: string; clientKey: string; nodeCount: number }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Nexus snapshot ingest failed',
        code: 'NEXUS_INGEST_FAILED',
      },
      { status: 500 }
    )
  }
}
