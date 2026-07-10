import { z } from 'zod'
import { relayAuthorized, requireClientKey } from '@/lib/relay-auth'
import { applyHeartbeat } from '@/lib/relay-heartbeat'
import type { APIResponse } from '@/types'
import type { ClientHealth } from '@/types/support'

export const dynamic = 'force-dynamic'

const schema = z.object({
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
 * POST /api/relay/heartbeat — canonical pilot heartbeat.
 * Upserts SupportClient, updates lastHeartbeatAt, raises alerts on RED.
 * Prefer this over diagnostics for lightweight keep-alive; diagnostics also
 * calls the same helper when a full snapshot is needed.
 */
export async function POST(req: Request): Promise<Response> {
  const a = relayAuthorized(req)
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }

  try {
    const raw: unknown = await req.json()
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid heartbeat payload', code: 'SCHEMA' },
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
      persistSnapshot: false,
    })

    return Response.json({
      success: true,
      data: {
        clientId: result.clientId,
        health: result.health,
        serverTime: new Date().toISOString(),
      },
    } satisfies APIResponse<{
      clientId: string
      health: ClientHealth
      serverTime: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Heartbeat failed',
        code: 'HEARTBEAT_FAILED',
      },
      { status: 500 }
    )
  }
}
