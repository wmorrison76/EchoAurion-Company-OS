import { z } from 'zod'
import { relayGuard, requireClientKey } from '@/lib/relay-auth'
import { enforcePerTenantSecretIfSet } from '@/lib/tenant-ingest-secret'
import {
  listPanelOpenP95,
  panelP95RegressionSignals,
  recordAnonymizedPanelOpen,
} from '@/lib/echo-guardrails'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const postSchema = z.object({
  clientKey: z.string().min(1).max(200),
  /** Anonymized open times only — panelId + elapsedMs. No userId / goals. */
  samples: z
    .array(
      z.object({
        panelId: z.string().min(1).max(80),
        elapsedMs: z.number().min(0).max(600_000),
      })
    )
    .min(1)
    .max(40),
})

/**
 * POST /api/relay/echo-panel-learning — ingest anonymized open-time samples.
 * GET  /api/relay/echo-panel-learning?clientKey=… — p95 + regression signals (auth).
 */
export async function POST(req: Request): Promise<Response> {
  const a = relayGuard(req, 'default')
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }
  try {
    const parsed = postSchema.safeParse(await req.json())
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

    const recorded = parsed.data.samples.map((s) =>
      recordAnonymizedPanelOpen({
        panelId: s.panelId,
        elapsedMs: s.elapsedMs,
        clientKey: key.clientKey,
      })
    )

    await audit('computer_agent', 'echo.panel_learning.ingest', undefined, {
      clientKey: key.clientKey,
      count: recorded.length,
      why: 'anonymized_p95_open_times_only',
      panels: recorded.map((r) => r.panelId).slice(0, 20),
    })

    return Response.json({
      success: true,
      data: {
        recorded: recorded.length,
        p95: listPanelOpenP95(),
        regressions: panelP95RegressionSignals(),
      },
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'learning ingest failed',
      },
      { status: 500 }
    )
  }
}

export async function GET(req: Request): Promise<Response> {
  const a = relayGuard(req, 'default')
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }
  const url = new URL(req.url)
  const key = requireClientKey(url.searchParams.get('clientKey'))
  if (!key.ok) {
    return Response.json(
      { success: false, error: key.error, code: key.code },
      { status: key.status }
    )
  }
  return Response.json({
    success: true,
    data: {
      p95: listPanelOpenP95(),
      regressions: panelP95RegressionSignals(),
      note: 'Anonymized panel open p95 only — no user PII',
    },
  } satisfies APIResponse<{
    p95: ReturnType<typeof listPanelOpenP95>
    regressions: ReturnType<typeof panelP95RegressionSignals>
    note: string
  }>)
}
