/**
 * Knights skill flywheel — learn from confirmed fixes, feed runbooks
 * into similar fingerprint drafts. Core deny-list never auto-promotes.
 * See docs/KNIGHTS_FLYWHEEL.md
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guardCorePaths } from '@/lib/core-path-guard'
import type { ErrorCategory } from '@/lib/error-taxonomy'

const EVAL_PROMOTE_THRESHOLD = 0.72
const MAX_RUNBOOK_CONTEXT = 2500

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s_/.-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3)
  )
}

/** Simple Jaccard overlap of significant tokens — 0..1. */
export function scoreDraftVsFix(draft: string, finalFix: string): number {
  const a = tokenize(draft)
  const b = tokenize(finalFix)
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

export async function loadRunbookContext(input: {
  fingerprint?: string | null
  productLine?: string | null
  errorCategory?: string | null
}): Promise<string> {
  const clauses: Array<Record<string, unknown>> = [{ status: 'PROMOTED' }]
  if (input.fingerprint) {
    const exact = await db.knightRunbook.findMany({
      where: {
        fingerprint: input.fingerprint,
        productLine: input.productLine ?? undefined,
        status: { in: ['PROMOTED', 'DRAFT'] },
      },
      orderBy: [{ status: 'desc' }, { hitCount: 'desc' }],
      take: 3,
    })
    if (exact.length) {
      return exact
        .map(
          (r) =>
            `[Runbook ${r.status} fp=${r.fingerprint.slice(0, 12)}]\n${r.title}\n${r.resolutionSteps}`
        )
        .join('\n\n')
        .slice(0, MAX_RUNBOOK_CONTEXT)
    }
  }

  const similar = await db.knightRunbook.findMany({
    where: {
      status: 'PROMOTED',
      ...(input.productLine ? { productLine: input.productLine } : {}),
      ...(input.errorCategory
        ? { errorCategory: input.errorCategory as ErrorCategory }
        : {}),
    },
    orderBy: { hitCount: 'desc' },
    take: 3,
  })
  if (!similar.length) return ''
  void clauses
  return similar
    .map((r) => `[Runbook PROMOTED]\n${r.title}\n${r.resolutionSteps}`)
    .join('\n\n')
    .slice(0, MAX_RUNBOOK_CONTEXT)
}

/**
 * After SYSTEM error ticket RESOLVED with a confirmed fix summary:
 * upsert DRAFT runbook; auto-promote only if eval passes AND not core.
 */
export async function learnFromResolution(input: {
  ticketId: string
  fingerprint: string
  productLine: string
  errorCategory?: ErrorCategory | null
  subject: string
  resolutionSteps: string
  evalScore?: number | null
  confirmedBy?: 'william_morrison' | null
}): Promise<{ runbookId: string; status: string; blocked: boolean }> {
  const core = guardCorePaths({
    planText: input.resolutionSteps,
    subject: input.subject,
  })

  // Never persist runbooks that prescribe removing auth / middleware / secrets.
  if (core.blocked) {
    await audit('computer_agent', 'help_desk.runbook.denied_core', input.ticketId, {
      matched: core.matched,
      reason: core.reason,
    })
    return { runbookId: '', status: 'REJECTED', blocked: true }
  }

  const title = input.subject.replace(/^\[SYSTEM\]\s*/i, '').slice(0, 120)
  const existing = await db.knightRunbook.findUnique({
    where: {
      fingerprint_productLine: {
        fingerprint: input.fingerprint,
        productLine: input.productLine,
      },
    },
  })

  const evalOk =
    typeof input.evalScore === 'number' && input.evalScore >= EVAL_PROMOTE_THRESHOLD
  const williamOk = input.confirmedBy === 'william_morrison'
  const canPromote = !core.needsHumanCoreReview && (williamOk || evalOk)

  if (existing) {
    const nextStatus =
      existing.status === 'PROMOTED'
        ? 'PROMOTED'
        : canPromote
          ? 'PROMOTED'
          : existing.status === 'REJECTED'
            ? 'DRAFT'
            : existing.status

    const updated = await db.knightRunbook.update({
      where: { id: existing.id },
      data: {
        title,
        resolutionSteps: input.resolutionSteps.slice(0, 8000),
        errorCategory: input.errorCategory ?? existing.errorCategory,
        hitCount: { increment: 1 },
        sourceTicketId: input.ticketId,
        evalScore: input.evalScore ?? existing.evalScore,
        denyIfCore: true,
        status: nextStatus,
        confirmedBy: canPromote
          ? (input.confirmedBy ?? existing.confirmedBy ?? 'computer_agent_eval')
          : existing.confirmedBy,
      },
    })

    await audit('computer_agent', 'help_desk.runbook.upsert', updated.id, {
      status: updated.status,
      fingerprint: input.fingerprint,
    })
    return { runbookId: updated.id, status: updated.status, blocked: false }
  }

  const created = await db.knightRunbook.create({
    data: {
      fingerprint: input.fingerprint,
      productLine: input.productLine,
      errorCategory: input.errorCategory ?? null,
      title,
      resolutionSteps: input.resolutionSteps.slice(0, 8000),
      denyIfCore: true,
      status: canPromote ? 'PROMOTED' : 'DRAFT',
      confirmedBy: canPromote
        ? (input.confirmedBy ?? 'computer_agent_eval')
        : null,
      evalScore: input.evalScore ?? null,
      sourceTicketId: input.ticketId,
    },
  })

  await audit('computer_agent', 'help_desk.runbook.create', created.id, {
    status: created.status,
    fingerprint: input.fingerprint,
  })
  return { runbookId: created.id, status: created.status, blocked: false }
}

/** William confirms a DRAFT runbook → PROMOTED (still core-scanned). */
export async function promoteRunbook(
  runbookId: string,
  confirmedBy: 'william_morrison'
): Promise<{ ok: boolean; reason?: string }> {
  const row = await db.knightRunbook.findUnique({ where: { id: runbookId } })
  if (!row) return { ok: false, reason: 'not_found' }
  const core = guardCorePaths({ planText: row.resolutionSteps, subject: row.title })
  if (core.blocked) {
    await db.knightRunbook.update({
      where: { id: runbookId },
      data: { status: 'REJECTED' },
    })
    return { ok: false, reason: 'core_denied' }
  }
  await db.knightRunbook.update({
    where: { id: runbookId },
    data: {
      status: 'PROMOTED',
      confirmedBy,
      denyIfCore: true,
    },
  })
  await audit(confirmedBy, 'help_desk.runbook.promote', runbookId)
  return { ok: true }
}

export async function recordKnightEval(input: {
  ticketId: string
  fingerprint?: string | null
  productLine?: string | null
  draftText: string
  finalFixText: string
}): Promise<{ id: string; score: number; matched: boolean }> {
  const score = scoreDraftVsFix(input.draftText, input.finalFixText)
  const matched = score >= EVAL_PROMOTE_THRESHOLD
  const row = await db.knightEval.create({
    data: {
      ticketId: input.ticketId,
      fingerprint: input.fingerprint ?? null,
      productLine: input.productLine ?? null,
      draftText: input.draftText.slice(0, 4000),
      finalFixText: input.finalFixText.slice(0, 4000),
      score,
      matched,
      actor: 'computer_agent',
    },
  })
  await audit('computer_agent', 'help_desk.knight_eval', input.ticketId, {
    score,
    matched,
  })
  return { id: row.id, score, matched }
}
