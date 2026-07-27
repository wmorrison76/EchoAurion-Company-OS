import { createHmac, timingSafeEqual } from 'crypto'
import { audit } from '@/lib/audit'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import {
  ingestRenderDeployFailure,
  ingestRenderRuntimeEvent,
} from '@/lib/ops-failure-ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/webhooks/render
 * Real-time Render events → same SYSTEM ticket + auto-rollback path as the
 * 5-minute poll, but with seconds latency. Poll stays as the fallback net.
 *
 * Setup: Render dashboard → Workspace settings → Webhooks → add
 * https://<host>/api/webhooks/render, copy the signing secret into
 * RENDER_WEBHOOK_SECRET (whsec_...).
 *
 * Verification: Standard-Webhooks (svix) scheme Render uses —
 * HMAC-SHA256 over `${id}.${timestamp}.${body}` with the base64-decoded
 * secret, base64 signature in `webhook-signature` as space-separated
 * `v1,<sig>` entries. 5-minute timestamp tolerance.
 * Middleware: excluded (public + signature verify).
 */

const TOLERANCE_MS = 5 * 60_000

function verifySignature(req: Request, rawBody: string, secret: string): boolean {
  const id = req.headers.get('webhook-id') ?? req.headers.get('svix-id')
  const timestamp = req.headers.get('webhook-timestamp') ?? req.headers.get('svix-timestamp')
  const sigHeader = req.headers.get('webhook-signature') ?? req.headers.get('svix-signature')
  if (!id || !timestamp || !sigHeader) return false

  const tsMs = Number(timestamp) * 1000
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > TOLERANCE_MS) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest()

  for (const entry of sigHeader.split(' ')) {
    const [, sig] = entry.split(',')
    if (!sig) continue
    try {
      const provided = Buffer.from(sig, 'base64')
      if (provided.length === expected.length && timingSafeEqual(provided, expected)) return true
    } catch {
      // malformed entry — try the next one
    }
  }
  return false
}

const DEPLOY_FAILURE = /fail|cancel|deactivat/i
const RUNTIME_FAILURE = /failed|unhealthy|oom|crash|exited|out_of_memory|suspend/i

export async function POST(req: Request): Promise<Response> {
  const throttle = allowIngestThrottle({ scope: 'render_webhook' })
  if (!throttle.ok) return throttleResponse(throttle)

  const secret = process.env.RENDER_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return Response.json(
      {
        success: false,
        error: 'RENDER_WEBHOOK_SECRET not configured',
        code: 'WEBHOOK_DISABLED',
        label: '? Render webhook disabled — set RENDER_WEBHOOK_SECRET',
      },
      { status: 503 }
    )
  }

  const rawBody = await req.text().catch(() => '')
  if (!verifySignature(req, rawBody, secret)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401', label: '✕ Bad signature' },
      { status: 401 }
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON', code: '400', label: '✕ Invalid JSON' },
      { status: 400 }
    )
  }

  const type = String(payload.type ?? '')
  const data = (payload.data ?? {}) as Record<string, unknown>
  const serviceId = String(data.serviceId ?? data.service_id ?? '')
  const serviceName = String(data.serviceName ?? data.service_name ?? (serviceId || 'render-service'))

  try {
    let ticketId: string | null = null
    let handled = false

    if (type.startsWith('deploy') && serviceId) {
      const deployId = String(data.deployId ?? data.deploy_id ?? '')
      const status = String(data.status ?? '')
      const commitSha = typeof data.commitSha === 'string' ? data.commitSha : null
      if (deployId && (DEPLOY_FAILURE.test(status) || DEPLOY_FAILURE.test(type))) {
        handled = true
        const r = await ingestRenderDeployFailure({
          serviceId,
          serviceName,
          deployId,
          status: status || 'failed',
          commitSha,
        })
        ticketId = r.ticketId ?? null
      } else if (commitSha && /live|succeed/i.test(status)) {
        // Successful deploy: confirm any tickets waiting on this commit.
        handled = true
        const { markFixDeployedForCommit } = await import('@/lib/fix-linkage')
        await markFixDeployedForCommit(commitSha).catch(() => ({ confirmed: 0 }))
      }
    } else if (serviceId && RUNTIME_FAILURE.test(type)) {
      handled = true
      ticketId = await ingestRenderRuntimeEvent(
        { id: serviceId, name: serviceName },
        {
          id: String(payload.id ?? `${type}-${Date.now()}`),
          type,
          timestamp: String(payload.timestamp ?? new Date().toISOString()),
          details: data,
        }
      )
    }

    await audit('computer_agent', 'ops.render_webhook', ticketId ?? undefined, {
      type,
      serviceId: serviceId || null,
      handled,
    }).catch(() => {})

    return Response.json({
      success: true,
      data: {
        handled,
        ticketId,
        label: handled
          ? ticketId
            ? '✕ Render failure captured (real-time)'
            : '? Failure seen, ticket dedup/skip'
          : `? Ignored event · ${type || 'unknown'}`,
      },
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Render webhook failed',
        label: '✕ Render webhook failed',
      },
      { status: 500 }
    )
  }
}

export async function GET(): Promise<Response> {
  return Response.json({
    success: true,
    data: {
      endpoint: '/api/webhooks/render',
      live: Boolean(process.env.RENDER_WEBHOOK_SECRET),
      auth: 'Standard-Webhooks signature (webhook-id/-timestamp/-signature) with RENDER_WEBHOOK_SECRET',
      handles: [
        'deploy_* with failing status → deploy-failure ticket + auto-rollback to last good deploy',
        'server failed/unhealthy/oom/crash/suspend → runtime-failure ticket',
      ],
      fallback: 'ops poll every 5 min (poll-failures) remains the safety net',
      docs: 'docs/ERROR_CAPTURE_AND_SCOPE.md',
    },
  })
}
