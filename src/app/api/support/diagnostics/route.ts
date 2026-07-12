import { z } from 'zod'
import { relayGuard, requireClientKey } from '@/lib/relay-auth'
import { applyHeartbeat } from '@/lib/relay-heartbeat'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const ingestSchema = z.object({
  clientKey: z.string().min(1).max(200),
  label: z.string().max(200).optional(),
  property: z.string().max(200).optional(),
  appVersion: z.string().max(50).optional(),
  platform: z.string().max(50).optional(),
  online: z.boolean().optional(),
  queueDepth: z.number().int().min(0).max(1_000_000).optional(),
  lastSyncAt: z.string().datetime().optional(),
  errorCount: z.number().int().min(0).max(1_000_000).optional(),
  details: z.record(z.unknown()).optional(),
})

/**
 * Tier 0 ingest — the product's Electron client POSTs a passive diagnostic
 * bundle here. Authenticated with a shared bearer secret (NOT the admin
 * session), so it is excluded from the auth middleware. Disabled entirely
 * unless SUPPORT_INGEST_SECRET is set — nothing is open by default.
 *
 * Also acts as a heartbeat (updates SupportClient.lastHeartbeatAt). Prefer
 * POST /api/relay/heartbeat for lightweight keep-alive without a snapshot.
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
    const parsed = ingestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid diagnostic payload', code: 'SCHEMA' },
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

    const result = await applyHeartbeat({
      ...parsed.data,
      clientKey: key.clientKey,
      persistSnapshot: true,
    })

    return Response.json(
      {
        success: true,
        data: { id: result.snapshotId ?? result.clientId, health: result.health },
      } satisfies APIResponse<{ id: string; health: string }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Ingest failed',
        code: 'INGEST_FAILED',
      },
      { status: 500 }
    )
  }
}
