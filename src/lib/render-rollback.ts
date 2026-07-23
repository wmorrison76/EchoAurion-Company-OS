/**
 * Render auto-correction: push → deploy fails → roll back to the last good
 * deploy, document everything on the SYSTEM ticket, and leave the forward fix
 * to the normal draft-PR + human-merge path.
 *
 * Constitution: rollback restores the most recent HUMAN-APPROVED deploy — it
 * introduces no new code, so it is allowed under `rollback_to_last_good`
 * (see constitution.ts). The forward fix still goes draft-PR → human merge.
 *
 * Kill switch: RENDER_AUTO_ROLLBACK=off|false|0 (default ON).
 * Dedupe: one rollback attempt per failing deployId (audit-log keyed).
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { checkConstitution } from '@/lib/constitution'
import { listRenderDeployHistory } from '@/lib/render'
import { recordTimelineEvent } from '@/lib/help-timeline'

const RENDER_API = 'https://api.render.com/v1'

export function autoRollbackEnabled(): boolean {
  const v = (process.env.RENDER_AUTO_ROLLBACK ?? 'on').toLowerCase()
  return !['off', 'false', '0'].includes(v)
}

/** Most recent deploy that finished `live` before the failing one. */
export async function findLastGoodDeploy(
  serviceId: string,
  excludeDeployId: string
): Promise<{ id: string; commitSha: string | null; triggeredAt: string } | null> {
  const history = await listRenderDeployHistory(serviceId, 10)
  const good = history.find((d) => d.level === 'ok' && d.id !== excludeDeployId)
  return good ? { id: good.id, commitSha: good.commitSha, triggeredAt: good.triggeredAt } : null
}

export async function rollbackRenderDeploy(
  serviceId: string,
  deployId: string
): Promise<{ ok: boolean; newDeployId?: string; error?: string }> {
  const apiKey = process.env.RENDER_API_KEY
  if (!apiKey) return { ok: false, error: 'RENDER_API_KEY not set' }
  try {
    const res = await fetch(`${RENDER_API}/services/${serviceId}/rollback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ deployId }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `Render rollback API ${res.status}: ${text.slice(0, 200)}` }
    }
    const body = (await res.json().catch(() => null)) as { id?: string } | null
    return { ok: true, newDeployId: body?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'rollback request failed' }
  }
}

async function alreadyAttempted(failingDeployId: string): Promise<boolean> {
  const prior = await db.auditLog
    .findFirst({
      where: {
        action: { in: ['ops.render.auto_rollback', 'ops.render.auto_rollback_failed'] },
        entityId: failingDeployId,
      },
      select: { id: true },
    })
    .catch(() => null)
  return Boolean(prior)
}

async function noteOnTicket(ticketId: string, body: string): Promise<void> {
  await db.helpMessage
    .create({ data: { ticketId, role: 'SYSTEM', body: body.slice(0, 4000) } })
    .catch(() => {})
}

/**
 * Called from deploy-failure ingest (poll AND webhook paths). Best-effort:
 * never throws — every outcome lands on the ticket + audit log.
 */
export async function maybeAutoRollbackOnDeployFailure(input: {
  serviceId: string
  serviceName: string
  failingDeployId: string
  failingSha?: string | null
  ticketId: string
}): Promise<{ attempted: boolean; ok?: boolean; reason?: string }> {
  const gate = checkConstitution('rollback_to_last_good')
  if (!gate.ok) return { attempted: false, reason: gate.reason }

  if (!autoRollbackEnabled()) {
    return { attempted: false, reason: 'RENDER_AUTO_ROLLBACK is off' }
  }
  if (await alreadyAttempted(input.failingDeployId)) {
    return { attempted: false, reason: 'already attempted for this deploy' }
  }

  const lastGood = await findLastGoodDeploy(input.serviceId, input.failingDeployId).catch(
    () => null
  )
  if (!lastGood) {
    await noteOnTicket(
      input.ticketId,
      `Auto-rollback: no known-good deploy found in recent history for ${input.serviceName} — service needs human attention.`
    )
    await audit('computer_agent', 'ops.render.auto_rollback_failed', input.failingDeployId, {
      serviceId: input.serviceId,
      reason: 'no_last_good',
    }).catch(() => {})
    return { attempted: true, ok: false, reason: 'no last good deploy' }
  }

  const result = await rollbackRenderDeploy(input.serviceId, lastGood.id)

  if (result.ok) {
    await noteOnTicket(
      input.ticketId,
      [
        `AUTO-ROLLBACK EXECUTED — ${input.serviceName}`,
        `Failed deploy: ${input.failingDeployId}${input.failingSha ? ` (${input.failingSha})` : ''}`,
        `Rolled back to: ${lastGood.id}${lastGood.commitSha ? ` (${lastGood.commitSha})` : ''} — last live deploy from ${lastGood.triggeredAt}`,
        result.newDeployId ? `Rollback deploy: ${result.newDeployId}` : null,
        `Service restored to the previously approved build. Forward fix stays draft-PR → human merge.`,
      ]
        .filter(Boolean)
        .join('\n')
    )
    await recordTimelineEvent({
      ticketId: input.ticketId,
      kind: 'fixing',
      label: 'Auto-rollback to last good deploy',
      detail: `${input.serviceName}: ${input.failingDeployId} → ${lastGood.id}`,
      actor: 'computer_agent',
    }).catch(() => {})
    await audit('computer_agent', 'ops.render.auto_rollback', input.failingDeployId, {
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      rolledBackTo: lastGood.id,
      newDeployId: result.newDeployId ?? null,
    }).catch(() => {})
    return { attempted: true, ok: true }
  }

  await noteOnTicket(
    input.ticketId,
    `Auto-rollback FAILED for ${input.serviceName}: ${result.error}. Manual rollback needed (Render dashboard → Deploys → ${lastGood.id}).`
  )
  await audit('computer_agent', 'ops.render.auto_rollback_failed', input.failingDeployId, {
    serviceId: input.serviceId,
    reason: result.error ?? 'unknown',
  }).catch(() => {})
  return { attempted: true, ok: false, reason: result.error }
}
