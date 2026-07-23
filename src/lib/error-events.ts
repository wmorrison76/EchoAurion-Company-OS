/**
 * Ingest + dedupe for pilot error_event → HelpTicket SYSTEM.
 * Same fingerprint within 1h updates occurrenceCount (no spam).
 * Upserts ErrorPattern for fleet learning (aggregated, no PII).
 * Agent loop via shouldQueueAgentLoop (GLOBAL/ACCOUNT/HIGH + AUTH/INFRA/API + meal/Chronos).
 */

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { applyHeartbeat } from '@/lib/relay-heartbeat'
import { classifyErrorScope, scopeRank, type ErrorBlastScope } from '@/lib/error-scope'
import {
  classifyErrorCategory,
  normalizeProductLine,
  type ErrorCategory,
  type ProductLine,
} from '@/lib/error-taxonomy'
import { redactMessage, redactStack } from '@/lib/error-redact'
import { toDetail } from '@/lib/help-desk'
import { recordTimelineEvent } from '@/lib/help-timeline'
import {
  escalateForGuestImpact,
  guestImpactFloorCopy,
  isGuestImpactModule,
  priorityRank,
} from '@/lib/guest-impact'
import type { HelpTicketDetail } from '@/types/help-desk'

const DEDUPE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

export interface ErrorEventInput {
  clientKey: string
  fingerprint: string
  message: string
  stack?: string | null
  errorClass?: string | null
  moduleHint?: string | null
  scopeHint?: ErrorBlastScope | null
  categoryHint?: ErrorCategory | null
  productLine?: string | null
  sessionHint?: string | null
  appVersion?: string | null
  platform?: string | null
  browser?: string | null
  os?: string | null
  source?: string | null // ErrorBoundary | window.onerror | unhandledrejection | server
  canaryClientKeys?: string[] | null
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

async function upsertErrorPattern(input: {
  fingerprint: string
  errorCategory: ErrorCategory
  errorScope: ErrorBlastScope
  productLine: ProductLine
  moduleHint: string | null
  errorClass: string | null
  sampleMessage: string
  clientKey: string
  ticketId: string
  isNewClient: boolean
}): Promise<{ id: string; errorScope: ErrorBlastScope }> {
  const existing = await db.errorPattern.findUnique({
    where: {
      fingerprint_productLine: {
        fingerprint: input.fingerprint,
        productLine: input.productLine,
      },
    },
  })

  if (existing) {
    const updated = await db.errorPattern.update({
      where: { id: existing.id },
      data: {
        hitCount: { increment: 1 },
        distinctClients: input.isNewClient
          ? { increment: 1 }
          : existing.distinctClients,
        lastSeenAt: new Date(),
        lastTicketId: input.ticketId,
        errorScope: input.errorScope,
        errorCategory: input.errorCategory,
        moduleHint: input.moduleHint ?? existing.moduleHint,
        errorClass: input.errorClass ?? existing.errorClass,
        sampleMessage: input.sampleMessage,
      },
    })
    return { id: updated.id, errorScope: updated.errorScope }
  }

  const created = await db.errorPattern.create({
    data: {
      fingerprint: input.fingerprint,
      errorCategory: input.errorCategory,
      errorScope: input.errorScope,
      productLine: input.productLine,
      moduleHint: input.moduleHint,
      errorClass: input.errorClass,
      sampleMessage: input.sampleMessage,
      hitCount: 1,
      distinctClients: 1,
      lastTicketId: input.ticketId,
    },
  })
  return { id: created.id, errorScope: created.errorScope }
}

/** Queue fleet learning for GLOBAL/COHORT patterns only — ACCOUNT never auto-learns. */
function queuePatternLearning(pattern: {
  id: string
  errorScope: ErrorBlastScope
}): void {
  if (pattern.errorScope !== 'GLOBAL' && pattern.errorScope !== 'COHORT') return
  void import('@/lib/echo-learning')
    .then(({ queueLearnFromPattern }) => queueLearnFromPattern(pattern.id))
    .catch((err) => console.error('[error-events] pattern learn queue failed', err))
}

function mergeScope(
  existing: ErrorBlastScope | null | undefined,
  next: ErrorBlastScope
): ErrorBlastScope {
  if (!existing) return next
  return scopeRank(next) > scopeRank(existing) ? next : existing
}

export async function ingestErrorEvent(
  input: ErrorEventInput
): Promise<{ ticket: HelpTicketDetail; created: boolean; promoted: boolean }> {
  const fingerprint = truncate(input.fingerprint, 128)
  const message = redactMessage(input.message)
  const stack = redactStack(input.stack)
  const productLine = normalizeProductLine(input.productLine)
  const errorCategory =
    input.categoryHint ??
    classifyErrorCategory({
      message,
      stack,
      errorClass: input.errorClass,
      moduleHint: input.moduleHint,
    })
  const now = new Date()
  const since = new Date(now.getTime() - DEDUPE_WINDOW_MS)

  const hb = await applyHeartbeat({
    clientKey: input.clientKey,
    online: true,
    platform: input.platform ?? input.os ?? undefined,
    appVersion: input.appVersion ?? undefined,
    errorCount: 1,
    persistSnapshot: false,
  })

  const openStatuses = ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] as const

  // Tenant isolation: dedupe ONLY within the same clientKey.
  // Never merge Company A's ticket body into Company B's (docs/DATA_ISOLATION_AND_COMPLIANCE.md).
  // Fleet-wide patterns still aggregate via ErrorPattern.distinctClients — not ticket merge.
  const existing = await db.helpTicket.findFirst({
    where: {
      fingerprint,
      channel: 'SYSTEM',
      clientKey: input.clientKey,
      status: { in: [...openStatuses] },
      OR: [{ lastOccurredAt: { gte: since } }, { updatedAt: { gte: since } }],
    },
    orderBy: { updatedAt: 'desc' },
  })

  const knownKeys = new Set<string>([
    ...(existing?.affectedClientKeys ?? []),
    ...(existing?.clientKey ? [existing.clientKey] : []),
    input.clientKey,
  ])
  const isNewClient =
    !existing?.affectedClientKeys.includes(input.clientKey) &&
    existing?.clientKey !== input.clientKey

  const hasCohortMeta = Boolean(
    input.browser || input.os || input.appVersion || input.platform
  )

  // Pattern evidence for GLOBAL: count distinct clients on ErrorPattern (not ticket merge).
  let patternDistinct = 1
  try {
    const pat = await db.errorPattern.findUnique({
      where: {
        fingerprint_productLine: { fingerprint, productLine },
      },
      select: { distinctClients: true },
    })
    if (pat) patternDistinct = pat.distinctClients + (isNewClient || !existing ? 1 : 0)
  } catch {
    // ignore
  }

  let scope = classifyErrorScope({
    message,
    stack,
    moduleHint: input.moduleHint,
    errorClass: input.errorClass,
    scopeHint: input.scopeHint,
    // Only pass multi-key evidence from THIS ticket's own keys — never invent cross-tenant.
    knownClientKeys: patternDistinct >= 2 ? [input.clientKey, '__pattern_multi__'] : [...knownKeys],
    hasCohortMeta,
  })

  let promoted = false
  if (existing?.errorScope && scopeRank(scope) > scopeRank(existing.errorScope)) {
    promoted = true
  }
  scope = mergeScope(existing?.errorScope as ErrorBlastScope | undefined, scope)

  // Strip client-supplied canary targets — operator-set only (tenant isolation).
  const canaryFromClient = undefined
  void canaryFromClient
  void input.canaryClientKeys

  if (existing) {
    const mergedKeys = Array.from(new Set([...(existing.affectedClientKeys ?? []), input.clientKey]))
    const moduleForImpact = input.moduleHint ?? existing.moduleHint
    const guestImpact = isGuestImpactModule(moduleForImpact)
    const nextPriority = guestImpact
      ? escalateForGuestImpact(existing.priority, { forceUrgent: scope === 'GLOBAL' })
      : existing.priority
    const priorityBumped = priorityRank(nextPriority) > priorityRank(existing.priority)

    const updated = await db.helpTicket.update({
      where: { id: existing.id },
      data: {
        occurrenceCount: { increment: 1 },
        lastOccurredAt: now,
        errorScope: scope,
        errorCategory,
        productLine,
        affectedClientKeys: mergedKeys,
        clientKey: existing.clientKey ?? input.clientKey,
        clientId: existing.clientId ?? hb.clientId,
        errorClass: input.errorClass ?? existing.errorClass,
        moduleHint: input.moduleHint ?? existing.moduleHint,
        sessionHint: input.sessionHint ?? existing.sessionHint,
        cohortBrowser: input.browser ?? existing.cohortBrowser,
        cohortOs: input.os ?? input.platform ?? existing.cohortOs,
        cohortAppVersion: input.appVersion ?? existing.cohortAppVersion,
        ...(priorityBumped ? { priority: nextPriority } : {}),
        // Never overwrite canaryClientKeys from relay ingest
        messages: {
          create: {
            role: 'SYSTEM',
            body: truncate(
              [
                `Repeat occurrence #${existing.occurrenceCount + 1}`,
                `clientKey=${input.clientKey}`,
                `category=${errorCategory}`,
                `productLine=${productLine}`,
                `source=${input.source ?? 'unknown'}`,
                priorityBumped
                  ? `guest-impact escalate → priority ${nextPriority} (meal-critical module; floor copy has no stacks)`
                  : null,
                stack ? `stack:\n${stack.slice(0, 1500)}` : null,
              ]
                .filter(Boolean)
                .join('\n'),
              3500
            ),
          },
        },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    const pattern = await upsertErrorPattern({
      fingerprint,
      errorCategory,
      errorScope: scope,
      productLine,
      moduleHint: input.moduleHint ?? null,
      errorClass: input.errorClass ?? null,
      sampleMessage: message,
      clientKey: input.clientKey,
      ticketId: existing.id,
      isNewClient: Boolean(isNewClient),
    })
    queuePatternLearning(pattern)

    if (promoted) {
      await db.helpMessage.create({
        data: {
          ticketId: existing.id,
          role: 'SYSTEM',
          body: `Scope promoted to ${scope} — fingerprint pattern (tenant-scoped ticket). GLOBAL fixes = draft PR only (constitution). Fleet notify requires canary/fleet stage (not auto ALL).`,
        },
      })
      await raiseAlert({
        kind: 'system',
        severity: 'CRITICAL',
        title: `Error promoted to ${scope}: ${truncate(message, 80)}`,
        body: `Fingerprint ${fingerprint} · tenant ${input.clientKey} · ${errorCategory}/${productLine}`,
        entityRef: existing.id,
        url: `/help-desk?ticket=${existing.id}`,
      })
      const { shouldQueueAgentLoop } = await import('@/lib/error-agent-loop')
      if (
        shouldQueueAgentLoop({
          errorScope: scope,
          priority: nextPriority,
          errorCategory,
          moduleHint: input.moduleHint,
        })
      ) {
        const { enqueueIngestJob } = await import('@/lib/ingest-queue')
        void enqueueIngestJob({
          kind: 'agent_loop',
          payload: { ticketId: existing.id },
          dedupeKey: `agent:${existing.id}`,
        }).catch((err) => console.error('[error-events] agent queue on promote failed', err))
      }
    }

    await audit('computer_agent', 'help_desk.error_event.dedupe', existing.id, {
      fingerprint,
      scope,
      errorCategory,
      productLine,
      clientKey: input.clientKey,
      occurrenceCount: existing.occurrenceCount + 1,
    } as unknown as Prisma.InputJsonValue)

    return { ticket: toDetail(updated), created: false, promoted }
  }

  // Reopen-on-recurrence (TICKET_VS_CODE_FIX_AUDIT.md P1): a RESOLVED/CLOSED
  // ticket whose fingerprint re-hits within 24h reopens — one continuous
  // audit trail instead of fragmenting across new ticket IDs, and an honest
  // signal that "resolved" didn't hold.
  const RECURRENCE_WINDOW_MS = 24 * 60 * 60 * 1000
  const recentlyResolved = await db.helpTicket.findFirst({
    where: {
      fingerprint,
      channel: 'SYSTEM',
      clientKey: input.clientKey,
      status: { in: ['RESOLVED', 'CLOSED'] },
      updatedAt: { gte: new Date(now.getTime() - RECURRENCE_WINDOW_MS) },
    },
    orderBy: { updatedAt: 'desc' },
  })
  if (recentlyResolved) {
    const reopened = await db.helpTicket.update({
      where: { id: recentlyResolved.id },
      data: {
        status: 'OPEN',
        occurrenceCount: { increment: 1 },
        lastOccurredAt: now,
        agentWorking: false,
        productFixDeployed: false,
        messages: {
          create: {
            role: 'SYSTEM',
            body: truncate(
              [
                `REOPENED — error recurred ${recentlyResolved.status === 'CLOSED' ? 'after close' : 'after resolution'} (fingerprint re-hit within 24h).`,
                recentlyResolved.closeReason
                  ? `Previous closeReason: ${recentlyResolved.closeReason}${recentlyResolved.closeReason !== 'resolved_fix' ? ' — reply was sent but no code shipped; the underlying bug is still live.' : ' — deployed fix did not hold.'}`
                  : null,
                `clientKey=${input.clientKey}`,
                stack ? `stack:\n${stack.slice(0, 1500)}` : null,
              ]
                .filter(Boolean)
                .join('\n'),
              3500
            ),
          },
        },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('computer_agent', 'help_desk.error_event.reopened', reopened.id, {
      fingerprint,
      previousStatus: recentlyResolved.status,
      previousCloseReason: recentlyResolved.closeReason,
      clientKey: input.clientKey,
    } as unknown as Prisma.InputJsonValue)

    const { shouldQueueAgentLoop } = await import('@/lib/error-agent-loop')
    if (
      shouldQueueAgentLoop({
        errorScope: (reopened.errorScope ?? scope) as ErrorBlastScope,
        priority: reopened.priority,
        errorCategory,
        moduleHint: input.moduleHint,
      })
    ) {
      const { enqueueIngestJob } = await import('@/lib/ingest-queue')
      void enqueueIngestJob({
        kind: 'agent_loop',
        payload: { ticketId: reopened.id },
        dedupeKey: `agent:${reopened.id}`,
      }).catch((err) => console.error('[error-events] agent queue on reopen failed', err))
    }

    return { ticket: toDetail(reopened), created: false, promoted: false }
  }

  const subject = truncate(`[SYSTEM] ${message}`, 120)
  const guestImpact = isGuestImpactModule(input.moduleHint)
  let priority =
    scope === 'GLOBAL' ? 'URGENT' : scope === 'ACCOUNT' || scope === 'COHORT' ? 'HIGH' : 'NORMAL'
  if (guestImpact) {
    priority = escalateForGuestImpact(priority, { forceUrgent: scope === 'GLOBAL' })
  }
  const floor = guestImpact ? guestImpactFloorCopy(input.moduleHint) : null

  const ticket = await db.helpTicket.create({
    data: {
      channel: 'SYSTEM',
      status: 'OPEN',
      priority,
      subject,
      clientKey: input.clientKey,
      clientId: hb.clientId,
      errorScope: scope,
      errorCategory,
      productLine,
      fingerprint,
      occurrenceCount: 1,
      affectedClientKeys: [input.clientKey],
      lastOccurredAt: now,
      notifyWhenFixed: true,
      sessionHint: input.sessionHint ?? null,
      errorClass: input.errorClass ?? null,
      moduleHint: input.moduleHint ?? null,
      cohortBrowser: input.browser ?? null,
      cohortOs: input.os ?? input.platform ?? null,
      cohortAppVersion: input.appVersion ?? null,
      canaryClientKeys: [], // operator-set only
      rolloutStage: null,
      agentWorking: false,
      messages: {
        create: [
          {
            role: 'SYSTEM',
            body: truncate(
              [
                'Auto-captured runtime error (no guest PII; payloads redacted).',
                `scope=${scope}`,
                `category=${errorCategory}`,
                `productLine=${productLine}`,
                `fingerprint=${fingerprint}`,
                `errorClass=${input.errorClass ?? 'n/a'}`,
                `module=${input.moduleHint ?? 'n/a'}`,
                guestImpact
                  ? `guestImpact=true · priority=${priority} · floor title “${floor?.title}” (no stacks to guests)`
                  : null,
                `source=${input.source ?? 'unknown'}`,
                `appVersion=${input.appVersion ?? 'n/a'}`,
                `platform=${input.platform ?? 'n/a'}`,
                `browser=${input.browser ?? 'n/a'}`,
                `os=${input.os ?? 'n/a'}`,
                `sessionHint=${input.sessionHint ?? 'n/a'}`,
                '',
                `message: ${message}`,
                stack ? `\nstack:\n${stack.slice(0, 2500)}` : '',
                '',
                'Remediation gate: Knights may draft + Architect may open a draft PR.',
                'Do NOT silent-merge to production. GLOBAL = draft PR only.',
                'Core paths (auth/middleware/relay secrets/destructive migrate) → NEEDS_HUMAN_CORE_REVIEW.',
                'Safe tools (restart/clear_cache) OK under autonomy dial.',
                'Tenant isolation: ticket scoped to this clientKey only.',
              ]
                .filter(Boolean)
                .join('\n'),
              6000
            ),
          },
        ],
      },
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      voiceNotes: { orderBy: { createdAt: 'asc' } },
      _count: { select: { messages: true } },
    },
  })

  const pattern = await upsertErrorPattern({
    fingerprint,
    errorCategory,
    errorScope: scope,
    productLine,
    moduleHint: input.moduleHint ?? null,
    errorClass: input.errorClass ?? null,
    sampleMessage: message,
    clientKey: input.clientKey,
    ticketId: ticket.id,
    isNewClient: true,
  })
  queuePatternLearning(pattern)

  await recordTimelineEvent({
    ticketId: ticket.id,
    kind: 'detected',
    label: guestImpact ? 'Guest-impact issue detected' : 'Issue detected',
    detail: guestImpact
      ? `${floor?.body ?? 'Service tools recovering.'} Scope ${scope}.`
      : `We’re on it — scope ${scope}. Friendly recovery only; no stack traces shown to guests.`,
    actor: 'computer_agent',
  }).catch(() => {})

  await audit('computer_agent', 'help_desk.error_event.create', ticket.id, {
    fingerprint,
    scope,
    errorCategory,
    productLine,
    clientKey: input.clientKey,
    guestImpact,
    priority,
  } as unknown as Prisma.InputJsonValue)

  await raiseAlert({
    kind: 'system',
    severity:
      scope === 'GLOBAL' || guestImpact
        ? 'CRITICAL'
        : scope === 'ACCOUNT' || scope === 'COHORT'
          ? 'WARN'
          : 'INFO',
    title: guestImpact
      ? `▲ Guest impact: ${truncate(message, 70)}`
      : `Auto ticket: ${truncate(message, 80)}`,
    body: `scope=${scope} · ${errorCategory} · ${productLine} · ${input.clientKey}${
      guestImpact ? ' · meal-critical module' : ''
    }`,
    entityRef: ticket.id,
    url: `/help-desk?ticket=${ticket.id}`,
  })

  // Queue agent + Knights when threshold met (async worker / ops-poll drain).
  const { shouldQueueAgentLoop } = await import('@/lib/error-agent-loop')
  if (
    shouldQueueAgentLoop({
      errorScope: scope,
      priority,
      errorCategory,
      moduleHint: input.moduleHint,
    })
  ) {
    const { enqueueIngestJob } = await import('@/lib/ingest-queue')
    void enqueueIngestJob({
      kind: 'agent_loop',
      payload: { ticketId: ticket.id },
      dedupeKey: `agent:${ticket.id}`,
    }).catch((err) => console.error('[error-events] agent queue failed', err))
  }

  return { ticket: toDetail(ticket), created: true, promoted: false }
}
