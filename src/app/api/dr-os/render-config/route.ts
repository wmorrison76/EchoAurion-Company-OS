/**
 * GET  /api/dr-os/render-config — list Render services (id/name/type; no env values)
 * POST /api/dr-os/render-config — upsert allowlisted env vars or apply suggested ECHO_AI_URL
 *
 * Auth: Dr. OS admin session → actor william_morrison
 *       OR Bearer $CRON_SECRET → actor computer_agent
 *
 * Never returns secret values. Audit stores key names only.
 * Knights / Round Table seats never receive RENDER_API_KEY.
 */

import { auth } from '@/lib/auth'
import { audit, type Actor } from '@/lib/audit'
import {
  RenderOpsError,
  applySuggestedEchoAiUrl,
  isRenderApiConfigured,
  listRenderOpsServices,
  resolveRenderServiceId,
  triggerRenderDeploy,
  upsertRenderEnvVars,
} from '@/lib/render-ops'
import {
  gateCronSecretRotation,
  rotateCronSecretEverywhere,
} from '@/lib/cron-secret-rotation'
import type { APIResponse } from '@/types'
import { verifyCronBearer } from '@/lib/verify-bearer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type AuthResult =
  | { ok: true; actor: Actor }
  | { ok: false; response: Response }

async function authorize(req: Request): Promise<AuthResult> {
  if (verifyCronBearer(req)) {
    return { ok: true, actor: 'computer_agent' }
  }
  const session = await auth()
  if (session?.user) {
    return { ok: true, actor: 'william_morrison' }
  }
  return {
    ok: false,
    response: Response.json(
      { success: false, error: 'Unauthorized', code: '401' } satisfies APIResponse<never>,
      { status: 401 }
    ),
  }
}

function opsErrorResponse(error: unknown): Response {
  if (error instanceof RenderOpsError) {
    return Response.json(
      {
        success: false,
        error: error.message,
        code: error.code,
      } satisfies APIResponse<never>,
      { status: error.status >= 400 && error.status < 600 ? error.status : 400 }
    )
  }
  return Response.json(
    {
      success: false,
      error: error instanceof Error ? error.message : 'Render ops failed',
      code: '500',
    } satisfies APIResponse<never>,
    { status: 500 }
  )
}

export async function GET(req: Request): Promise<Response> {
  const gate = await authorize(req)
  if (!gate.ok) return gate.response

  if (!isRenderApiConfigured()) {
    return Response.json(
      {
        success: false,
        error:
          'RENDER_API_KEY not set — paste once on echoaurion-company-os Environment (William). Knights never receive this key.',
        code: 'RENDER_NOT_CONFIGURED',
      } satisfies APIResponse<never>,
      { status: 503 }
    )
  }

  try {
    const services = await listRenderOpsServices()
    return Response.json({
      success: true,
      data: {
        renderApiConfigured: true,
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          region: s.region,
          suspended: s.suspended,
        })),
      },
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<{
      renderApiConfigured: boolean
      services: Array<{
        id: string
        name: string
        type: string
        region: string | null
        suspended: boolean
      }>
    }>)
  } catch (error) {
    return opsErrorResponse(error)
  }
}

type PostBody = {
  /** Service id (`srv-…`) or exact name. Defaults to RENDER_SERVICE_ID / echoaurion-company-os. */
  service?: string
  /** Allowlisted KEY → value map. Values never audited or returned. */
  env?: Record<string, string>
  /** Apply canonical ECHO_AI_URL (luccca-web echo-brain). */
  apply?: 'echo_ai_url' | 'suggested_echo_ai_url'
  applySuggestedEchoAiUrl?: boolean
  /** Trigger deploy after upsert (default true for apply; false for raw env unless set). */
  redeploy?: boolean
  /**
   * Required to rotate CRON_SECRET. Rotation always fans out to every holder
   * (web + all echoaurion-company-os crons) — `service` is ignored for that key.
   */
  confirmRotateCronSecret?: boolean
  /** Human who approved the rotation. Required when the actor is computer_agent. */
  approvedBy?: string
}

export async function POST(req: Request): Promise<Response> {
  const gate = await authorize(req)
  if (!gate.ok) return gate.response

  if (!isRenderApiConfigured()) {
    return Response.json(
      {
        success: false,
        error:
          'set RENDER_API_KEY first — paste once on Company OS web Environment. Perplexity/Cursor may use .env.local locally; Knights seats never get the key.',
        code: 'RENDER_NOT_CONFIGURED',
      } satisfies APIResponse<never>,
      { status: 503 }
    )
  }

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON body', code: '400' } satisfies APIResponse<never>,
      { status: 400 }
    )
  }

  const applyEcho =
    body.apply === 'echo_ai_url' ||
    body.apply === 'suggested_echo_ai_url' ||
    body.applySuggestedEchoAiUrl === true

  try {
    if (applyEcho) {
      const result = await applySuggestedEchoAiUrl({
        service: body.service,
        redeploy: body.redeploy !== false,
      })
      await audit(gate.actor, 'dr_os.render_config.apply_echo_ai_url', result.serviceId, {
        serviceName: result.serviceName,
        keysSet: result.keysSet,
        redeploy: body.redeploy !== false,
        deployId: result.deployId,
        // suggested URL is non-secret (public luccca path)
        suggestedUrl: result.suggestedUrl,
      })
      return Response.json({
        success: true,
        data: {
          label: '✓ Applied ECHO_AI_URL via Render',
          serviceId: result.serviceId,
          serviceName: result.serviceName,
          keysSet: result.keysSet,
          deployId: result.deployId,
          suggestedUrl: result.suggestedUrl,
        },
        meta: { lastUpdated: new Date().toISOString() },
      })
    }

    const env = body.env
    if (!env || typeof env !== 'object' || Array.isArray(env)) {
      return Response.json(
        {
          success: false,
          error: 'Body must include env: { KEY: value } or apply: "echo_ai_url"',
          code: '400',
        } satisfies APIResponse<never>,
        { status: 400 }
      )
    }

    const sanitized: Record<string, string> = {}
    for (const [k, v] of Object.entries(env)) {
      if (typeof v !== 'string') {
        return Response.json(
          {
            success: false,
            error: `Env value for ${k} must be a string`,
            code: '400',
          } satisfies APIResponse<never>,
          { status: 400 }
        )
      }
      sanitized[k] = v
    }

    // CRON_SECRET is never written to one service — it fans out to every
    // holder or fails loudly. Handled before the single-service upsert below.
    const cronSecretValue = sanitized.CRON_SECRET
    let rotation: Awaited<ReturnType<typeof rotateCronSecretEverywhere>> | null = null

    if (typeof cronSecretValue === 'string') {
      const rotationGate = gateCronSecretRotation({
        actor: gate.actor,
        confirmed: body.confirmRotateCronSecret === true,
        approvedBy: body.approvedBy,
        agentRotationAllowed: process.env.CRON_SECRET_ROTATION_ALLOW_AGENT === 'true',
      })

      if (!rotationGate.allowed) {
        console.error(
          `[cron-secret] ROTATION DENIED actor=${gate.actor} code=${rotationGate.code} — ${rotationGate.reason}`
        )
        await audit(gate.actor, 'dr_os.render_config.cron_secret_rotation_denied', undefined, {
          code: rotationGate.code,
          reason: rotationGate.reason,
          approvedBy: body.approvedBy ?? null,
          requestedService: body.service ?? null,
        }).catch(() => {})
        return Response.json(
          {
            success: false,
            error: rotationGate.reason,
            code: rotationGate.code,
          } satisfies APIResponse<never>,
          { status: 403 }
        )
      }

      rotation = await rotateCronSecretEverywhere({
        value: cronSecretValue,
        actor: gate.actor,
        approvedBy: body.approvedBy,
        redeployWeb: body.redeploy !== false,
      })
      delete sanitized.CRON_SECRET

      await audit(
        gate.actor,
        rotation.ok
          ? 'dr_os.render_config.cron_secret_rotate'
          : 'dr_os.render_config.cron_secret_rotate_partial',
        undefined,
        {
          phase: rotation.phase,
          approvedBy: body.approvedBy ?? null,
          updated: rotation.updated,
          failed: rotation.failed,
          notAttempted: rotation.notAttempted,
          webDeployId: rotation.webDeployId,
        }
      )

      if (!rotation.ok) {
        return Response.json(
          {
            success: false,
            error: rotation.label,
            code: rotation.phase === 'web_failed' ? 'ROTATION_PARTIAL' : 'ROTATION_ABORTED',
            data: {
              label: rotation.label,
              phase: rotation.phase,
              updated: rotation.updated,
              failed: rotation.failed,
              notAttempted: rotation.notAttempted,
            },
          },
          { status: 500 }
        )
      }
    }

    const remainingKeys = Object.keys(sanitized)
    if (rotation && remainingKeys.length === 0) {
      return Response.json({
        success: true,
        data: {
          label: rotation.label,
          keysSet: ['CRON_SECRET'],
          rotation: {
            phase: rotation.phase,
            updated: rotation.updated,
            failed: rotation.failed,
            webDeployId: rotation.webDeployId,
          },
        },
        meta: { lastUpdated: new Date().toISOString() },
      })
    }

    const resolved = await resolveRenderServiceId(body.service)
    const keysSet = await upsertRenderEnvVars(resolved.id, sanitized)
    let deployId: string | null = null
    if (body.redeploy === true) {
      deployId = await triggerRenderDeploy(resolved.id)
    }

    await audit(gate.actor, 'dr_os.render_config.upsert', resolved.id, {
      serviceName: resolved.name,
      keysSet,
      redeploy: body.redeploy === true,
      deployId,
    })

    return Response.json({
      success: true,
      data: {
        label: rotation
          ? `${rotation.label} · ✓ Updated ${keysSet.length} other env var(s) on ${resolved.name}`
          : `✓ Updated ${keysSet.length} env var(s) via Render`,
        serviceId: resolved.id,
        serviceName: resolved.name,
        keysSet: rotation ? [...keysSet, 'CRON_SECRET'] : keysSet,
        deployId,
        rotation: rotation
          ? {
              phase: rotation.phase,
              updated: rotation.updated,
              failed: rotation.failed,
              webDeployId: rotation.webDeployId,
            }
          : null,
      },
      meta: { lastUpdated: new Date().toISOString() },
    })
  } catch (error) {
    return opsErrorResponse(error)
  }
}
