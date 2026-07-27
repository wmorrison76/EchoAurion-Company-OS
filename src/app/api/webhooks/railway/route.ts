import { timingSafeEqual } from 'crypto'
import { audit } from '@/lib/audit'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import { ingestRailwayDeployFailure } from '@/lib/ops-failure-ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/webhooks/railway
 * Scaffold: Railway deploy/build failure → same SYSTEM ticket path as Render.
 *
 * Honest status: **not production-wired**. Render poll + GitHub webhook are live.
 * Enable when Railway is still in use:
 *   1. Set RAILWAY_WEBHOOK_SECRET on Company OS
 *   2. Point Railway project webhook here (or curl with Bearer secret)
 *   3. Body JSON: { serviceId, serviceName, deploymentId, status, commitSha? }
 *
 * Auth: Authorization: Bearer $RAILWAY_WEBHOOK_SECRET
 *   (or X-Railway-Signature header matching the secret — simple equality scaffold)
 * Middleware: excluded (public + secret verify).
 *
 * Pilot note: docs/RAILWAY-RETIREMENT.md — prefer retiring Railway; Render is sole
 * production runtime for luccca-web. Keep this stub if a non-prod Railway service
 * still fails and you want tickets.
 */

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false
  try {
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(req: Request): Promise<Response> {
  const throttle = allowIngestThrottle({ scope: 'railway_webhook' })
  if (!throttle.ok) return throttleResponse(throttle)

  const secret = process.env.RAILWAY_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return Response.json(
      {
        success: false,
        error: 'RAILWAY_WEBHOOK_SECRET not configured',
        code: 'WEBHOOK_DISABLED',
        label: '? Railway webhook disabled — set RAILWAY_WEBHOOK_SECRET (scaffold)',
      },
      { status: 503 }
    )
  }

  const authz = req.headers.get('authorization')
  const bearer = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : null
  const headerSig = req.headers.get('x-railway-signature')
  if (!secretMatches(bearer, secret) && !secretMatches(headerSig, secret)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401', label: '✕ Unauthorized' },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON', code: '400', label: '✕ Invalid JSON' },
      { status: 400 }
    )
  }

  const o = (body ?? {}) as Record<string, unknown>
  // Accept flat scaffold body or a nested Railway-ish shape.
  const serviceId = String(
    o.serviceId ?? o.service_id ?? (o.service as { id?: string } | undefined)?.id ?? ''
  )
  const serviceName = String(
    o.serviceName ??
      o.service_name ??
      (o.service as { name?: string } | undefined)?.name ??
      'railway-service'
  )
  const deploymentId = String(
    o.deploymentId ??
      o.deployment_id ??
      (o.deployment as { id?: string } | undefined)?.id ??
      ''
  )
  const status = String(
    o.status ??
      (o.deployment as { status?: string } | undefined)?.status ??
      o.type ??
      ''
  )
  const commitSha =
    (typeof o.commitSha === 'string' ? o.commitSha : null) ??
    (typeof o.commit_sha === 'string' ? o.commit_sha : null) ??
    null
  const environmentName =
    typeof o.environmentName === 'string'
      ? o.environmentName
      : typeof o.environment === 'string'
        ? o.environment
        : null

  if (!serviceId || !deploymentId || !status) {
    return Response.json(
      {
        success: false,
        error: 'Require serviceId, deploymentId, status',
        code: '400',
        label: '✕ Missing fields',
      },
      { status: 400 }
    )
  }

  try {
    const result = await ingestRailwayDeployFailure({
      serviceId,
      serviceName,
      deploymentId,
      status,
      commitSha,
      environmentName,
    })

    await audit('computer_agent', 'ops.railway_webhook', result.ticketId, {
      ingested: result.ingested,
      reason: result.reason,
      serviceId,
      deploymentId,
      status,
    })

    return Response.json({
      success: true,
      data: {
        ingested: result.ingested,
        ticketId: result.ticketId ?? null,
        reason: result.reason,
        label: result.ingested
          ? '✕ Railway deploy failure captured'
          : `? Skipped · ${result.reason ?? 'not_failed'}`,
      },
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Railway webhook failed',
        label: '✕ Railway webhook failed',
      },
      { status: 500 }
    )
  }
}

export async function GET(): Promise<Response> {
  return Response.json({
    success: true,
    data: {
      endpoint: '/api/webhooks/railway',
      status: 'scaffold',
      live: false,
      auth: 'Bearer RAILWAY_WEBHOOK_SECRET or X-Railway-Signature',
      docs: 'docs/ERROR_CAPTURE_AND_SCOPE.md',
      note: 'Render + GitHub are live. Railway poll/webhook are stubs until token+project wired or service retired.',
      exampleBody: {
        serviceId: 'svc_xxx',
        serviceName: 'luccca-api',
        deploymentId: 'dep_xxx',
        status: 'FAILED',
        commitSha: 'abc1234',
      },
    },
  })
}
