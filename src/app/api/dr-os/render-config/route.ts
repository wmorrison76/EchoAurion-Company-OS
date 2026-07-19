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
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type AuthResult =
  | { ok: true; actor: Actor }
  | { ok: false; response: Response }

async function authorize(req: Request): Promise<AuthResult> {
  const cronSecret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization')
  if (cronSecret && authz === `Bearer ${cronSecret}`) {
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
        label: `✓ Updated ${keysSet.length} env var(s) via Render`,
        serviceId: resolved.id,
        serviceName: resolved.name,
        keysSet,
        deployId,
      },
      meta: { lastUpdated: new Date().toISOString() },
    })
  } catch (error) {
    return opsErrorResponse(error)
  }
}
