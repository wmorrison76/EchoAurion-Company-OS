/**
 * Ingest + dedupe for pilot error_event → HelpTicket SYSTEM.
 * Same fingerprint within 1h updates occurrenceCount (no spam).
 * Upserts ErrorPattern for fleet learning (aggregated, no PII).
 * GLOBAL / high severity → queue computer_agent + Knights loop.
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
}): Promise<void> {
  const existing = await db.errorPattern.findUnique({
    where: {
      fingerprint_productLine: {
        fingerprint: input.fingerprint,
        productLine: input.productLine,
      },
    },
  })

  if (existing) {
    await db.errorPattern.update({
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
    return
  }

  await db.errorPattern.create({
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

  const existing = await db.helpTicket.findFirst({
    where: {
      fingerprint,
      channel: 'SYSTEM',
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

  let scope = classifyErrorScope({
    message,
    stack,
    moduleHint: input.moduleHint,
    errorClass: input.errorClass,
    scopeHint: input.scopeHint,
    knownClientKeys: [...knownKeys],
    hasCohortMeta,
  })

  let promoted = false
  if (existing?.errorScope && scopeRank(scope) > scopeRank(existing.errorScope)) {
    promoted = true
  }
  scope = mergeScope(existing?.errorScope as ErrorBlastScope | undefined, scope)

  if (existing) {
    const mergedKeys = Array.from(knownKeys)
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
        ...(input.canaryClientKeys?.length
          ? { canaryClientKeys: input.canaryClientKeys }
          : {}),
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

    await upsertErrorPattern({
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

    if (promoted) {
      await db.helpMessage.create({
        data: {
          ticketId: existing.id,
          role: 'SYSTEM',
          body: `Scope promoted to ${scope} — fingerprint seen across ${mergedKeys.length} clientKey(s). GLOBAL fixes = draft PR only (constitution).`,
        },
      })
      await raiseAlert({
        kind: 'system',
        severity: 'CRITICAL',
        title: `Error promoted to ${scope}: ${truncate(message, 80)}`,
        body: `Fingerprint ${fingerprint} · ${mergedKeys.length} clients · ${errorCategory}/${productLine}`,
        entityRef: existing.id,
        url: `/help-desk?ticket=${existing.id}`,
      })
      if (scope === 'GLOBAL') {
        // Queue — never N sync LLM calls under a stampede (docs/SCALE_AND_THROTTLE.md).
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
      occurrenceCount: existing.occurrenceCount + 1,
    } as unknown as Prisma.InputJsonValue)

    return { ticket: toDetail(updated), created: false, promoted }
  }

  const subject = truncate(`[SYSTEM] ${message}`, 120)
  const priority =
    scope === 'GLOBAL' ? 'URGENT' : scope === 'ACCOUNT' || scope === 'COHORT' ? 'HIGH' : 'NORMAL'

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
      canaryClientKeys: input.canaryClientKeys?.filter(Boolean) ?? [],
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
              ].join('\n'),
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

  await upsertErrorPattern({
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

  await recordTimelineEvent({
    ticketId: ticket.id,
    kind: 'detected',
    label: 'Issue detected',
    detail: `We’re on it — scope ${scope}. Friendly recovery only; no stack traces shown to guests.`,
    actor: 'computer_agent',
  }).catch(() => {})

  await audit('computer_agent', 'help_desk.error_event.create', ticket.id, {
    fingerprint,
    scope,
    errorCategory,
    productLine,
    clientKey: input.clientKey,
  } as unknown as Prisma.InputJsonValue)

  await raiseAlert({
    kind: 'system',
    severity: scope === 'GLOBAL' ? 'CRITICAL' : scope === 'ACCOUNT' || scope === 'COHORT' ? 'WARN' : 'INFO',
    title: `Auto ticket: ${truncate(message, 80)}`,
    body: `scope=${scope} · ${errorCategory} · ${productLine} · ${input.clientKey}`,
    entityRef: ticket.id,
    url: `/help-desk?ticket=${ticket.id}`,
  })

  // Queue agent + Knights for GLOBAL / high severity (async worker / cron drain).
  if (scope === 'GLOBAL' || priority === 'URGENT' || priority === 'HIGH') {
    const { enqueueIngestJob } = await import('@/lib/ingest-queue')
    void enqueueIngestJob({
      kind: 'agent_loop',
      payload: { ticketId: ticket.id },
      dedupeKey: `agent:${ticket.id}`,
    }).catch((err) => console.error('[error-events] agent queue failed', err))
  }

  return { ticket: toDetail(ticket), created: true, promoted: false }
}
