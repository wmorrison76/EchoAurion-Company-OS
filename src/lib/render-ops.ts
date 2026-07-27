/**
 * Render ops — server-side env upsert via RENDER_API_KEY.
 *
 * Used by authenticated Dr. OS admin / computer_agent (CRON_SECRET Bearer).
 * Never put RENDER_API_KEY into Knights prompts, Help Desk tickets, or audit values.
 * Audit payloads may include key *names* only.
 */

import { listRenderServices, type RenderServiceSummary } from '@/lib/render'
import { SUGGESTED_ECHO_AI_URL } from '@/lib/echo-brain'

const RENDER_API = 'https://api.render.com/v1'

/** Keys agents/admin may set via /api/dr-os/render-config (values never logged). */
export const RENDER_OPS_ALLOWED_KEYS = [
  'CRON_SECRET',
  'ECHO_AI_URL',
  'ECHO_AI_KEY',
  'SUPPORT_INGEST_SECRET',
  'RENDER_SERVICE_ID',
  'GITHUB_TOKEN',
  'STRIPE_SECRET_KEY',
  'PRODUCT_DATABASE_URL',
  'RELAY_HANDSHAKE_REQUIRED',
  'RELAY_HANDSHAKE_SKEW_MS',
  'WEB_SERVICE_URL',
  'NEXTAUTH_URL',
  'FIX_DIGEST_TO',
  'SUPPORT_EMAIL_WEBHOOK_SECRET',
  'SUPPORT_SMS_WEBHOOK_SECRET',
  'GITHUB_WEBHOOK_SECRET',
] as const

export type RenderOpsAllowedKey = (typeof RENDER_OPS_ALLOWED_KEYS)[number]

const ALLOWED = new Set<string>(RENDER_OPS_ALLOWED_KEYS)

export function isRenderApiConfigured(): boolean {
  return Boolean(process.env.RENDER_API_KEY?.trim())
}

function apiKeyOrThrow(): string {
  const key = process.env.RENDER_API_KEY?.trim()
  if (!key) {
    throw new RenderOpsError(
      'RENDER_API_KEY not set — paste once on echoaurion-company-os (William); Knights never receive it',
      'RENDER_NOT_CONFIGURED'
    )
  }
  return key
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

export class RenderOpsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400
  ) {
    super(message)
    this.name = 'RenderOpsError'
  }
}

export function assertAllowedEnvKeys(keys: string[]): void {
  const bad = keys.filter((k) => !ALLOWED.has(k))
  if (bad.length > 0) {
    throw new RenderOpsError(
      `Env key(s) not allowlisted for Render ops: ${bad.join(', ')}`,
      'KEY_NOT_ALLOWED'
    )
  }
}

/** List services (id/name/type only). Reuses Fleet Nexus list helper. */
export async function listRenderOpsServices(): Promise<RenderServiceSummary[]> {
  apiKeyOrThrow()
  return listRenderServices()
}

/**
 * Resolve service by Render id (`srv-…`) or exact service name.
 * Defaults to RENDER_SERVICE_ID, then echoaurion-company-os.
 */
export async function resolveRenderServiceId(
  service?: string | null
): Promise<{ id: string; name: string }> {
  const apiKey = apiKeyOrThrow()
  const hint =
    service?.trim() ||
    process.env.RENDER_SERVICE_ID?.trim() ||
    'echoaurion-company-os'

  if (hint.startsWith('srv-')) {
    const res = await fetch(`${RENDER_API}/services/${hint}`, {
      headers: authHeaders(apiKey),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (!res.ok) {
      throw new RenderOpsError(`Render service ${hint} not found`, 'SERVICE_NOT_FOUND', 404)
    }
    const body = (await res.json()) as { name?: string }
    return { id: hint, name: body.name ?? hint }
  }

  const services = await listRenderServices()
  const match = services.find((s) => s.name === hint || s.id === hint)
  if (!match) {
    throw new RenderOpsError(
      `No Render service matching "${hint}"`,
      'SERVICE_NOT_FOUND',
      404
    )
  }
  return { id: match.id, name: match.name }
}

/** Upsert one env var (per-key PUT — does not wipe other vars). */
export async function upsertRenderEnvVar(
  serviceId: string,
  key: string,
  value: string
): Promise<void> {
  assertAllowedEnvKeys([key])
  if (typeof value !== 'string' || value.length === 0) {
    throw new RenderOpsError(`Empty value for ${key}`, 'EMPTY_VALUE')
  }
  const apiKey = apiKeyOrThrow()
  const res = await fetch(
    `${RENDER_API}/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: authHeaders(apiKey),
      body: JSON.stringify({ value }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    }
  )
  if (!res.ok) {
    throw new RenderOpsError(
      `Render env upsert failed for ${key} (HTTP ${res.status})`,
      'RENDER_API_ERROR',
      res.status >= 400 && res.status < 600 ? res.status : 502
    )
  }
}

/** Upsert multiple allowlisted keys. Returns key names set (never values). */
export async function upsertRenderEnvVars(
  serviceId: string,
  env: Record<string, string>
): Promise<string[]> {
  const keys = Object.keys(env)
  if (keys.length === 0) {
    throw new RenderOpsError('No env keys provided', 'EMPTY_ENV')
  }
  assertAllowedEnvKeys(keys)
  const set: string[] = []
  for (const key of keys) {
    await upsertRenderEnvVar(serviceId, key, env[key]!)
    set.push(key)
  }
  return set
}

/** Trigger a deploy so new env vars take effect. */
export async function triggerRenderDeploy(serviceId: string): Promise<string | null> {
  const apiKey = apiKeyOrThrow()
  const res = await fetch(`${RENDER_API}/services/${encodeURIComponent(serviceId)}/deploys`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new RenderOpsError(
      `Render deploy trigger failed (HTTP ${res.status})`,
      'DEPLOY_FAILED',
      res.status >= 400 && res.status < 600 ? res.status : 502
    )
  }
  const body = (await res.json()) as { id?: string; deploy?: { id?: string } }
  return body.id ?? body.deploy?.id ?? null
}

/** Apply canonical luccca-web Chef's Brain URL to Company OS web service. */
export async function applySuggestedEchoAiUrl(opts?: {
  service?: string | null
  redeploy?: boolean
}): Promise<{
  serviceId: string
  serviceName: string
  keysSet: string[]
  suggestedUrl: string
  deployId: string | null
}> {
  const resolved = await resolveRenderServiceId(opts?.service)
  const keysSet = await upsertRenderEnvVars(resolved.id, {
    ECHO_AI_URL: SUGGESTED_ECHO_AI_URL,
  })
  let deployId: string | null = null
  if (opts?.redeploy !== false) {
    deployId = await triggerRenderDeploy(resolved.id)
  }
  return {
    serviceId: resolved.id,
    serviceName: resolved.name,
    keysSet,
    suggestedUrl: SUGGESTED_ECHO_AI_URL,
    deployId,
  }
}
