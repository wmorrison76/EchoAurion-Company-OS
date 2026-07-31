/**
 * CRON_SECRET rotation — fan-out to every holder, never one service.
 *
 * A `CRON_SECRET` written to a single Render service is always an outage: the
 * crons authenticate to the web service with this value, so any holder left on
 * the old string 401s until someone notices. Rotation therefore discovers the
 * full holder set from the Render API (by name prefix, so new crons are picked
 * up without editing this file) and writes in two phases:
 *
 *   Phase 1 — every non-web holder. If ANY write fails the rotation aborts
 *             before web is touched, so the old secret still matches everywhere
 *             and nothing 401s.
 *   Phase 2 — the web service (the verifier) last. A failure here is the only
 *             partial state possible and is alerted as CRITICAL.
 *
 * Values are never logged, audited, or returned — only service names.
 */

import { raiseAlert } from '@/lib/alerts'
import { checkConstitution } from '@/lib/constitution'
import { listRenderServices, type RenderServiceSummary } from '@/lib/render'
import { triggerRenderDeploy, upsertRenderEnvVarUnchecked, RenderOpsError } from '@/lib/render-ops'
import type { Actor } from '@/lib/audit'

/** Company OS services are named `echoaurion-company-os[-suffix]`. */
export const CRON_SECRET_SERVICE_PREFIX = 'echoaurion-company-os'

/** The web service that verifies the Bearer — always written last. */
export const CRON_SECRET_WEB_SERVICE_NAME = 'echoaurion-company-os'

export interface CronSecretHolder {
  id: string
  name: string
  type: string
  isWeb: boolean
  /** `prefix` = discovered via Render API; `extra` = named in CRON_SECRET_EXTRA_HOLDERS. */
  source: 'prefix' | 'extra'
}

export interface HolderWriteResult {
  id: string
  name: string
  isWeb: boolean
  ok: boolean
  error: string | null
}

export type RotationPhase = 'complete' | 'aborted_before_web' | 'web_failed'

export interface CronSecretRotationResult {
  ok: boolean
  phase: RotationPhase
  label: string
  /** Names of services now holding the new value. */
  updated: string[]
  /** Services that failed, with the reason. */
  failed: Array<{ name: string; error: string }>
  /** Non-web holders skipped because the rotation aborted. */
  notAttempted: string[]
  holders: HolderWriteResult[]
  webDeployId: string | null
}

/**
 * Services outside the `echoaurion-company-os` prefix that also hold the
 * secret (e.g. `luccca-py-api`). Comma-separated service names or `srv-…` ids.
 */
function extraHolderNames(): string[] {
  return (process.env.CRON_SECRET_EXTRA_HOLDERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Pick the full holder set out of a Render service list. Pure so the discovery
 * rule is testable without the API.
 */
export function selectCronSecretHolders(
  services: Array<Pick<RenderServiceSummary, 'id' | 'name' | 'type'>>,
  opts?: { extraNames?: string[]; webServiceId?: string | null }
): { holders: CronSecretHolder[]; missingExtras: string[] } {
  const extras = opts?.extraNames ?? []
  const webServiceId = opts?.webServiceId?.trim() || null
  const byName = new Map<string, CronSecretHolder>()

  const isWeb = (s: { id: string; name: string }) =>
    s.name === CRON_SECRET_WEB_SERVICE_NAME || (webServiceId !== null && s.id === webServiceId)

  for (const s of services) {
    const prefixMatch =
      s.name === CRON_SECRET_SERVICE_PREFIX || s.name.startsWith(`${CRON_SECRET_SERVICE_PREFIX}-`)
    if (!prefixMatch) continue
    byName.set(s.name, { id: s.id, name: s.name, type: s.type, isWeb: isWeb(s), source: 'prefix' })
  }

  const missingExtras: string[] = []
  for (const wanted of extras) {
    const match = services.find((s) => s.name === wanted || s.id === wanted)
    if (!match) {
      missingExtras.push(wanted)
      continue
    }
    if (byName.has(match.name)) continue
    byName.set(match.name, {
      id: match.id,
      name: match.name,
      type: match.type,
      isWeb: isWeb(match),
      source: 'extra',
    })
  }

  const holders = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
  return { holders, missingExtras }
}

/** Discover every holder from the live Render API. */
export async function discoverCronSecretHolders(): Promise<{
  holders: CronSecretHolder[]
  missingExtras: string[]
}> {
  const services = await listRenderServices()
  if (services.length === 0) {
    throw new RenderOpsError(
      'Render API returned no services — cannot rotate CRON_SECRET without the full holder list',
      'HOLDERS_UNAVAILABLE',
      502
    )
  }
  const result = selectCronSecretHolders(services, {
    extraNames: extraHolderNames(),
    webServiceId: process.env.RENDER_SERVICE_ID ?? null,
  })
  if (!result.holders.some((h) => h.isWeb)) {
    throw new RenderOpsError(
      `No web service named "${CRON_SECRET_WEB_SERVICE_NAME}" found — refusing to rotate CRON_SECRET on crons alone (they would 401)`,
      'WEB_HOLDER_NOT_FOUND',
      409
    )
  }
  if (result.missingExtras.length > 0) {
    throw new RenderOpsError(
      `CRON_SECRET_EXTRA_HOLDERS names no such Render service: ${result.missingExtras.join(', ')} — fix the list or the rotation would leave it stale`,
      'EXTRA_HOLDER_NOT_FOUND',
      409
    )
  }
  return result
}

const WRITE_CONCURRENCY = 4

async function writeAll(
  holders: CronSecretHolder[],
  write: (holder: CronSecretHolder) => Promise<void>
): Promise<HolderWriteResult[]> {
  const out: HolderWriteResult[] = []
  for (let i = 0; i < holders.length; i += WRITE_CONCURRENCY) {
    const chunk = holders.slice(i, i + WRITE_CONCURRENCY)
    const settled = await Promise.all(
      chunk.map(async (holder): Promise<HolderWriteResult> => {
        try {
          await write(holder)
          return { id: holder.id, name: holder.name, isWeb: holder.isWeb, ok: true, error: null }
        } catch (error) {
          return {
            id: holder.id,
            name: holder.name,
            isWeb: holder.isWeb,
            ok: false,
            error: error instanceof Error ? error.message : 'write failed',
          }
        }
      })
    )
    out.push(...settled)
  }
  return out
}

/**
 * Two-phase fan-out over an already-discovered holder set. `write` is injected
 * so the phase/abort behaviour is testable without hitting Render.
 */
export async function fanOutCronSecret(
  holders: CronSecretHolder[],
  write: (holder: CronSecretHolder) => Promise<void>
): Promise<CronSecretRotationResult> {
  const web = holders.filter((h) => h.isWeb)
  const crons = holders.filter((h) => !h.isWeb)
  if (web.length === 0) {
    throw new RenderOpsError(
      'Holder set contains no web service — refusing partial rotation',
      'WEB_HOLDER_NOT_FOUND',
      409
    )
  }

  const cronResults = await writeAll(crons, write)
  const cronFailures = cronResults.filter((r) => !r.ok)

  if (cronFailures.length > 0) {
    return {
      ok: false,
      phase: 'aborted_before_web',
      label: `✕ Rotation aborted — ${cronFailures.length} of ${crons.length} cron holder(s) failed; web left on the old secret so nothing 401s`,
      updated: cronResults.filter((r) => r.ok).map((r) => r.name),
      failed: cronFailures.map((r) => ({ name: r.name, error: r.error ?? 'write failed' })),
      notAttempted: web.map((h) => h.name),
      holders: cronResults,
      webDeployId: null,
    }
  }

  const webResults = await writeAll(web, write)
  const webFailures = webResults.filter((r) => !r.ok)
  const all = [...cronResults, ...webResults]

  if (webFailures.length > 0) {
    return {
      ok: false,
      phase: 'web_failed',
      label: `✕ PARTIAL ROTATION — crons hold the new CRON_SECRET but web failed; every cron will 401 until web is fixed`,
      updated: all.filter((r) => r.ok).map((r) => r.name),
      failed: webFailures.map((r) => ({ name: r.name, error: r.error ?? 'write failed' })),
      notAttempted: [],
      holders: all,
      webDeployId: null,
    }
  }

  return {
    ok: true,
    phase: 'complete',
    label: `✓ CRON_SECRET rotated on all ${all.length} holder(s)`,
    updated: all.map((r) => r.name),
    failed: [],
    notAttempted: [],
    holders: all,
    webDeployId: null,
  }
}

export interface RotationGateInput {
  actor: Actor
  /** Caller set `confirmRotateCronSecret: true`. */
  confirmed: boolean
  /** Human who approved (required for agent-initiated rotation). */
  approvedBy?: string | null
  /** CRON_SECRET_ROTATION_ALLOW_AGENT === 'true' on the web service. */
  agentRotationAllowed: boolean
}

export interface RotationGateResult {
  allowed: boolean
  code: string
  reason: string
}

/**
 * Explicit-approval gate. Constitution rule `no_core_self_harm` puts secret
 * rotation under dual human control, so `computer_agent` — which reaches this
 * route with nothing but the Bearer every cron already carries — cannot rotate
 * unless a human has flipped CRON_SECRET_ROTATION_ALLOW_AGENT and named an
 * approver. Pure, so the gate is testable.
 */
export function gateCronSecretRotation(input: RotationGateInput): RotationGateResult {
  if (!input.confirmed) {
    return {
      allowed: false,
      code: 'ROTATION_NOT_CONFIRMED',
      reason:
        'CRON_SECRET rotation requires confirmRotateCronSecret: true — it rewrites the secret on every Company OS holder, never one service',
    }
  }

  if (input.actor === 'computer_agent') {
    if (!input.agentRotationAllowed) {
      const verdict = checkConstitution('rotate_secrets')
      return {
        allowed: false,
        code: 'ROTATION_NEEDS_HUMAN',
        reason: `${verdict.reason} — sign in as Dr. OS to rotate, or have William set CRON_SECRET_ROTATION_ALLOW_AGENT=true for a one-off automated rotation`,
      }
    }
    if (!input.approvedBy?.trim()) {
      return {
        allowed: false,
        code: 'ROTATION_NEEDS_APPROVER',
        reason:
          'Agent-initiated CRON_SECRET rotation requires approvedBy naming the human who approved it',
      }
    }
  }

  return { allowed: true, code: 'ROTATION_ALLOWED', reason: 'Explicitly confirmed rotation' }
}

/**
 * Rotate CRON_SECRET across every holder. Alerts on any failure so a partial
 * rotation reaches William's phone instead of waiting for 401 loops.
 */
export async function rotateCronSecretEverywhere(input: {
  value: string
  actor: Actor
  approvedBy?: string | null
  /** Redeploy web after a complete rotation so the running instance reloads env. */
  redeployWeb?: boolean
}): Promise<CronSecretRotationResult & { missingExtras: string[] }> {
  if (typeof input.value !== 'string' || input.value.trim().length === 0) {
    throw new RenderOpsError('Empty value for CRON_SECRET', 'EMPTY_VALUE')
  }

  const { holders, missingExtras } = await discoverCronSecretHolders()

  console.warn(
    `[cron-secret] ROTATION STARTED actor=${input.actor} approvedBy=${input.approvedBy ?? 'n/a'} holders=${holders.length} (${holders.map((h) => h.name).join(', ')})`
  )

  const result = await fanOutCronSecret(holders, (holder) =>
    upsertRenderEnvVarUnchecked(holder.id, 'CRON_SECRET', input.value)
  )

  let webDeployId: string | null = null
  if (result.ok && input.redeployWeb !== false) {
    const web = holders.find((h) => h.isWeb)
    if (web) {
      webDeployId = await triggerRenderDeploy(web.id).catch(() => null)
    }
  }

  if (result.ok) {
    console.warn(`[cron-secret] ROTATION COMPLETE holders=${result.updated.join(', ')}`)
  } else {
    console.error(
      `[cron-secret] ROTATION ${result.phase.toUpperCase()} updated=[${result.updated.join(', ')}] failed=[${result.failed
        .map((f) => `${f.name}: ${f.error}`)
        .join('; ')}]`
    )
    await raiseAlert({
      kind: 'system',
      severity: 'CRITICAL',
      title:
        result.phase === 'web_failed'
          ? '✕ CRON_SECRET partially rotated — crons will 401'
          : '✕ CRON_SECRET rotation aborted before web',
      body: `${result.label}\nUpdated: ${result.updated.join(', ') || 'none'}\nFailed: ${result.failed
        .map((f) => `${f.name} (${f.error})`)
        .join(', ')}`,
      entityRef: 'cron_secret_rotation',
      url: '/dr-os',
    }).catch(() => {})
  }

  return { ...result, webDeployId, missingExtras }
}
