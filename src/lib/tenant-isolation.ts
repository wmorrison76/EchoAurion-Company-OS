/**
 * Tenant isolation guards — Company A's data must never merge into Company B's.
 * GLOBAL/COHORT knowledge writes require PII-free scrub + scope allowlist.
 * See docs/DATA_ISOLATION_AND_COMPLIANCE.md
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { assertPiiFree, redactSensitive } from '@/lib/error-redact'
import { findForbiddenPiiKey } from '@/lib/knowledge-ingest'

export type KnowledgeShareScope = 'GLOBAL' | 'COHORT' | 'ACCOUNT'

export class TenantIsolationError extends Error {
  readonly code: string
  constructor(message: string, code = 'TENANT_ISOLATION') {
    super(message)
    this.name = 'TenantIsolationError'
    this.code = code
  }
}

/** Synthetic ops clientKeys (CI/deploy) — not property tenants. */
const SYSTEM_CLIENT_RE = /^(github\/|render\/|company-os-)/i

export function isSystemClientKey(clientKey: string | null | undefined): boolean {
  if (!clientKey) return false
  return SYSTEM_CLIENT_RE.test(clientKey)
}

/**
 * Assert two clientKeys refer to the same tenant boundary.
 * System keys only match themselves (exact).
 */
export function assertClientKeyMatch(
  expected: string | null | undefined,
  actual: string | null | undefined,
  context = 'tenant'
): void {
  const a = expected?.trim()
  const b = actual?.trim()
  if (!a || !b) {
    throw new TenantIsolationError(
      `${context}: clientKey required on both sides`,
      'CLIENT_KEY_REQUIRED'
    )
  }
  if (a !== b) {
    throw new TenantIsolationError(
      `${context}: cross-tenant denied (${a.slice(0, 24)}… ≠ ${b.slice(0, 24)}…)`,
      'CROSS_TENANT_DENIED'
    )
  }
}

/**
 * Deny reading/writing a ticket (or other row) from a different tenant.
 * GLOBAL/COHORT tickets may list multiple affectedClientKeys — caller must
 * be in that set (or be the owning clientKey).
 */
export function assertTicketTenantAccess(input: {
  ticketClientKey: string | null | undefined
  affectedClientKeys?: string[] | null
  errorScope?: string | null
  callerClientKey: string
  allowSystemCaller?: boolean
}): void {
  const caller = input.callerClientKey.trim()
  if (!caller) {
    throw new TenantIsolationError('caller clientKey required', 'CLIENT_KEY_REQUIRED')
  }
  if (input.allowSystemCaller && isSystemClientKey(caller)) return

  const owner = input.ticketClientKey?.trim()
  const affected = input.affectedClientKeys ?? []
  if (owner && owner === caller) return
  if (affected.includes(caller)) return

  // Fleet-wide GLOBAL tickets: only William/session paths should fan-out;
  // relay callers still need membership in affectedClientKeys.
  if (input.errorScope === 'GLOBAL' || input.errorScope === 'COHORT') {
    throw new TenantIsolationError(
      'caller not in affectedClientKeys for fleet-scoped ticket',
      'CROSS_TENANT_DENIED'
    )
  }

  throw new TenantIsolationError(
    'ticket belongs to another tenant',
    'CROSS_TENANT_DENIED'
  )
}

/**
 * PII-free + scope gate before GLOBAL/COHORT knowledge writes.
 * ACCOUNT may keep clientKey; GLOBAL/COHORT must clear clientKey and pass scrub.
 */
export async function assertGlobalKnowledgeWriteAllowed(input: {
  content: string
  metadata?: Record<string, unknown> | null
  shareScope: KnowledgeShareScope
  clientKey?: string | null
  actor?: 'william_morrison' | 'computer_agent'
  entityId?: string
}): Promise<{ contentRedacted: string; clientKey: string | null }> {
  const contentRedacted = redactSensitive(input.content, 8000)
  const piiKey = findForbiddenPiiKey({
    ...(input.metadata ?? {}),
    body: contentRedacted,
  })
  if (piiKey) {
    throw new TenantIsolationError(`PII key forbidden: ${piiKey}`, 'PII_REJECTED')
  }

  const scrub = assertPiiFree(contentRedacted)
  if (!scrub.ok) {
    throw new TenantIsolationError(
      `PII/health residue after redact: ${scrub.reason}`,
      'PII_REJECTED'
    )
  }

  if (input.shareScope === 'ACCOUNT') {
    if (!input.clientKey?.trim()) {
      throw new TenantIsolationError(
        'ACCOUNT knowledge requires clientKey',
        'ACCOUNT_REQUIRES_CLIENT'
      )
    }
    return { contentRedacted, clientKey: input.clientKey.trim() }
  }

  // GLOBAL / COHORT — never carry another tenant's account content.
  if (input.clientKey?.trim() && !isSystemClientKey(input.clientKey)) {
    // Strip tenant binding for fleet share; content must already be pattern-only.
    await audit(input.actor ?? 'computer_agent', 'echo.knowledge.global_scrub', input.entityId, {
      shareScope: input.shareScope,
      strippedClientKeyPrefix: input.clientKey.slice(0, 16),
    }).catch(() => {})
  }

  return { contentRedacted, clientKey: null }
}

/**
 * Validate clientKey is registered (or a system/ops key).
 * Does not auto-create tenants — heartbeats may still upsert separately.
 */
export async function assertRegisteredOrSystemClient(
  clientKey: string
): Promise<{ ok: true; registered: boolean } | { ok: false; code: string; error: string }> {
  const key = clientKey.trim()
  if (!key) {
    return { ok: false, code: 'CLIENT_KEY_REQUIRED', error: 'clientKey is required' }
  }
  if (isSystemClientKey(key)) {
    return { ok: true, registered: false }
  }
  const row = await db.supportClient.findUnique({
    where: { clientKey: key },
    select: { id: true },
  })
  // Soft registry: allow first-seen keys (heartbeat will register) but audit.
  if (!row) {
    await audit('computer_agent', 'tenant.unregistered_client', undefined, {
      clientKey: key.slice(0, 64),
    }).catch(() => {})
  }
  return { ok: true, registered: Boolean(row) }
}

/**
 * Sanitize Knights / agent prompt thread: drop bodies that look like another
 * tenant's free-text (customer questions) when assembling SYSTEM repair context.
 * Keep redacted SYSTEM telemetry lines; never inject guest/staff PII.
 */
export function sanitizeAgentThreadForTenant(input: {
  messages: Array<{ role: string; body: string }>
  ticketClientKey: string | null
  channel: string
}): string {
  const lines: string[] = []
  for (const m of input.messages) {
    if (m.role === 'CUSTOMER' || m.role === 'USER') {
      // Never put another property's customer prose into Knights for SYSTEM repairs.
      if (input.channel === 'SYSTEM') {
        lines.push(`[${m.role}] [redacted-customer-body — tenant isolation]`)
        continue
      }
      lines.push(`[${m.role}] ${redactSensitive(m.body, 800)}`)
      continue
    }
    if (m.role === 'SYSTEM') {
      // Strip accidental cross-tenant clientKey dumps beyond our own.
      let body = redactSensitive(m.body, 1500)
      if (input.ticketClientKey) {
        const own = escapeRegExp(input.ticketClientKey)
        body = body.replace(
          new RegExp(`clientKey=(?!${own})[^\\s\\n]+`, 'gi'),
          'clientKey=[other-tenant-redacted]'
        )
      }
      lines.push(`[SYSTEM] ${body}`)
      continue
    }
    lines.push(`[${m.role}] ${redactSensitive(m.body, 1200)}`)
  }
  return lines.join('\n\n').slice(0, 6000)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
