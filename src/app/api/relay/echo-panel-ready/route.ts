import { z } from 'zod'
import { relayGuard, requireClientKey } from '@/lib/relay-auth'
import { enforcePerTenantSecretIfSet } from '@/lib/tenant-ingest-secret'
import { cancelPendingEchoPanelTickets } from '@/lib/echo-panel-ready'
import {
  isEchoPanelWatchEnabled,
  recordAnonymizedPanelOpen,
} from '@/lib/echo-guardrails'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  panelId: z.string().min(1).max(80),
  fingerprint: z.string().max(160).optional().nullable(),
  elapsedMs: z.number().min(0).max(600_000).optional().nullable(),
  reason: z.string().max(120).optional(),
})

/**
 * POST /api/relay/echo-panel-ready
 * Success signal: panel loaded (possibly after soft ticket) → cancel pending.
 * Also records anonymized open-time sample for p95 learning.
 */
export async function POST(req: Request): Promise<Response> {
  const a = relayGuard(req, 'default')
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }

  if (!isEchoPanelWatchEnabled()) {
    return Response.json({
      success: true,
      data: {
        cancelled: 0,
        ticketIds: [] as string[],
        questionIds: [] as string[],
        label: '○ ECHO_PANEL_WATCH=off',
        learning: null,
      },
    })
  }

  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid payload', code: 'SCHEMA' },
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

    const tenant = await enforcePerTenantSecretIfSet({
      clientKey: key.clientKey,
      req,
      sharedOk: true,
    })
    if (!tenant.ok) {
      return Response.json(
        { success: false, error: tenant.error, code: tenant.code },
        { status: tenant.status }
      )
    }

    const learning =
      typeof parsed.data.elapsedMs === 'number'
        ? recordAnonymizedPanelOpen({
            panelId: parsed.data.panelId,
            elapsedMs: parsed.data.elapsedMs,
            clientKey: key.clientKey,
          })
        : null

    const cancelled = await cancelPendingEchoPanelTickets({
      clientKey: key.clientKey,
      panelId: parsed.data.panelId,
      fingerprint: parsed.data.fingerprint,
      elapsedMs: parsed.data.elapsedMs,
      reason: parsed.data.reason ?? 'loaded_late',
    })

    return Response.json({
      success: true,
      data: { ...cancelled, learning },
    } satisfies APIResponse<typeof cancelled & { learning: typeof learning }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'echo-panel-ready failed',
      },
      { status: 500 }
    )
  }
}
