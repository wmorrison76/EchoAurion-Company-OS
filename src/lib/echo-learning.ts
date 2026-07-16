/**
 * Echo Learning Plane — PII-safe knowledge chunks for Company OS / Dr. OS.
 * Text + metadata first; embeddings optional (Neon pgvector TODO).
 * See docs/ECHO_LEARNING_PLANE.md
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { redactSensitive } from '@/lib/error-redact'
import { enqueueIngestJob, processIngestJobs } from '@/lib/ingest-queue'
import {
  assertGlobalKnowledgeWriteAllowed,
  TenantIsolationError,
} from '@/lib/tenant-isolation'

export type EchoKnowledgeSection =
  | 'ops'
  | 'hospitality'
  | 'runbook'
  | 'help'
  | 'error_pattern'
  | 'procedure'
  | 'domain'

export type EchoShareScope = 'GLOBAL' | 'COHORT' | 'ACCOUNT'

const OPS_HELP_TAG = /^(ops|public|procedure|runbook|macro|help)$/i
const BLOCKED_HELP_TAG = /private|crm|investor|pii|guest|staff/i

/**
 * Hub meta signal so Knowledge Plane "Signals" KPI moves with internal learning.
 * Payload is allowlisted knowledge_meta only — no PII keys, no raw text.
 * ACCOUNT chunks never emit fleet signals.
 */
async function emitLearningMetaSignal(input: {
  section: string
  sourceType: string
  sourceRef?: string | null
  shareScope: EchoShareScope
  chunkId: string
  created: boolean
}): Promise<void> {
  if (input.shareScope === 'ACCOUNT') return
  try {
    await db.knowledgeSignal.create({
      data: {
        clientKey: 'system:echo-learning',
        schemaVersion: '1',
        signalType: 'knowledge_meta',
        aggregationLevel: 'network',
        payload: {
          event: input.created ? 'chunk_created' : 'chunk_updated',
          section: input.section,
          sourceType: input.sourceType,
          sourceRefPrefix: input.sourceRef?.slice(0, 12) ?? null,
          shareScope: input.shareScope,
          chunkIdPrefix: input.chunkId.slice(0, 12),
        },
        sampleSize: 1,
        confidence: 1,
      },
    })
  } catch (err) {
    console.error('[echo-learning] meta signal failed', err)
  }
}

export async function upsertKnowledgeChunk(input: {
  section: EchoKnowledgeSection
  domain?: string | null
  sourceType: string
  sourceRef?: string | null
  content: string
  metadata?: Record<string, unknown> | null
  productLine?: string | null
  clientKey?: string | null
  shareScope?: EchoShareScope
}): Promise<{ id: string; created: boolean } | { rejected: true; reason: string }> {
  const shareScope = input.shareScope ?? (input.clientKey ? 'ACCOUNT' : 'GLOBAL')

  let contentRedacted: string
  let boundClientKey: string | null
  try {
    const gated = await assertGlobalKnowledgeWriteAllowed({
      content: input.content,
      metadata: input.metadata,
      shareScope,
      clientKey: input.clientKey,
    })
    contentRedacted = gated.contentRedacted
    boundClientKey = gated.clientKey
  } catch (err) {
    if (err instanceof TenantIsolationError) {
      return { rejected: true, reason: err.code.toLowerCase() }
    }
    throw err
  }

  if (!contentRedacted.trim()) {
    return { rejected: true, reason: 'empty_after_redact' }
  }

  if (input.sourceRef) {
    const existing = await db.echoKnowledgeChunk.findFirst({
      where: {
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        section: input.section,
        shareScope,
        ...(shareScope === 'ACCOUNT'
          ? { clientKey: boundClientKey }
          : { clientKey: null }),
      },
    })
    if (existing) {
      // Never let ACCOUNT overwrite GLOBAL or vice versa via partial match.
      if (existing.shareScope !== shareScope) {
        return { rejected: true, reason: 'scope_collision' }
      }
      if (
        shareScope === 'ACCOUNT' &&
        existing.clientKey &&
        boundClientKey &&
        existing.clientKey !== boundClientKey
      ) {
        return { rejected: true, reason: 'cross_tenant_denied' }
      }
      await db.echoKnowledgeChunk.update({
        where: { id: existing.id },
        data: {
          contentRedacted,
          domain: input.domain ?? existing.domain,
          metadata: (input.metadata ?? existing.metadata) as object | undefined,
          productLine: input.productLine ?? existing.productLine,
          clientKey: boundClientKey,
          shareScope,
        },
      })
      await audit('computer_agent', 'echo.knowledge.chunk.upsert', existing.id, {
        section: input.section,
        sourceType: input.sourceType,
        shareScope,
        clientKey: boundClientKey,
        created: false,
      })
      await emitLearningMetaSignal({
        section: input.section,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        shareScope,
        chunkId: existing.id,
        created: false,
      })
      return { id: existing.id, created: false }
    }
  }

  const row = await db.echoKnowledgeChunk.create({
    data: {
      section: input.section,
      domain: input.domain ?? null,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef ?? null,
      contentRedacted,
      metadata: (input.metadata ?? undefined) as object | undefined,
      productLine: input.productLine ?? null,
      clientKey: boundClientKey,
      shareScope,
      embedding: undefined,
    },
  })

  await audit('computer_agent', 'echo.knowledge.chunk.upsert', row.id, {
    section: input.section,
    sourceType: input.sourceType,
    shareScope,
    clientKey: boundClientKey,
    created: true,
  })

  await emitLearningMetaSignal({
    section: input.section,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    shareScope,
    chunkId: row.id,
    created: true,
  })

  await enqueueIngestJob({
    kind: 'knowledge_embed',
    payload: { chunkId: row.id },
    dedupeKey: `embed:${row.id}`,
  })

  return { id: row.id, created: true }
}

export async function ingestRunbookChunk(runbookId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!runbookId) return { ok: false, reason: 'missing_id' }
  const rb = await db.knightRunbook.findUnique({ where: { id: runbookId } })
  if (!rb) return { ok: false, reason: 'not_found' }
  if (rb.status === 'REJECTED') return { ok: false, reason: 'rejected_runbook' }
  // Fleet learning only from confirmed / promoted runbooks — never DRAFT speculation.
  if (rb.status !== 'PROMOTED') return { ok: false, reason: 'not_promoted' }

  const content = [
    `Runbook: ${rb.title}`,
    `fingerprint=${rb.fingerprint.slice(0, 16)}`,
    `productLine=${rb.productLine}`,
    `category=${rb.errorCategory ?? 'n/a'}`,
    `status=${rb.status}`,
    '',
    rb.resolutionSteps,
  ].join('\n')

  const r = await upsertKnowledgeChunk({
    section: 'runbook',
    domain: rb.errorCategory ?? 'ops',
    sourceType: 'knight_runbook',
    sourceRef: rb.id,
    content,
    productLine: rb.productLine,
    shareScope: 'GLOBAL',
    metadata: {
      fingerprintPrefix: rb.fingerprint.slice(0, 16),
      status: rb.status,
    },
  })
  if ('rejected' in r) return { ok: false, reason: r.reason }
  return { ok: true }
}

export async function ingestErrorPatternChunk(
  patternId: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!patternId) return { ok: false, reason: 'missing_id' }
  const p = await db.errorPattern.findUnique({ where: { id: patternId } })
  if (!p) return { ok: false, reason: 'not_found' }

  const content = [
    `Error pattern (${p.errorCategory} / ${p.errorScope})`,
    `productLine=${p.productLine}`,
    `module=${p.moduleHint ?? 'n/a'}`,
    `class=${p.errorClass ?? 'n/a'}`,
    `hits=${p.hitCount} clients=${p.distinctClients}`,
    `sample=${p.sampleMessage}`,
  ].join('\n')

  // ACCOUNT/USER patterns stay ACCOUNT — never auto-promote to COHORT/GLOBAL
  // without William/operator gate (docs/ECHO_LEARNING_PLANE.md).
  const shareScope: EchoShareScope =
    p.errorScope === 'GLOBAL'
      ? 'GLOBAL'
      : p.errorScope === 'COHORT'
        ? 'COHORT'
        : 'ACCOUNT'

  const r = await upsertKnowledgeChunk({
    section: 'error_pattern',
    domain: p.errorCategory,
    sourceType: 'error_pattern',
    sourceRef: p.id,
    content,
    productLine: p.productLine,
    shareScope,
    // ACCOUNT chunks need a synthetic key when pattern has no single tenant —
    // use fingerprint prefix so retrieve never returns them fleet-wide.
    clientKey: shareScope === 'ACCOUNT' ? `pattern:${p.fingerprint.slice(0, 24)}` : null,
    metadata: {
      hitCount: p.hitCount,
      distinctClients: p.distinctClients,
      fingerprintPrefix: p.fingerprint.slice(0, 16),
    },
  })
  if ('rejected' in r) return { ok: false, reason: r.reason }
  return { ok: true }
}

export async function ingestHelpArticleChunk(
  articleId: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!articleId) return { ok: false, reason: 'missing_id' }
  const a = await db.helpArticle.findUnique({ where: { id: articleId } })
  if (!a) return { ok: false, reason: 'not_found' }

  // Only ops/public Help Files — skip private/crm/investor and drafts without ops tags.
  const blocked = a.tags.some((t) => BLOCKED_HELP_TAG.test(t))
  if (blocked) return { ok: false, reason: 'tag_blocked' }
  const allow =
    a.public === true || a.tags.some((t) => OPS_HELP_TAG.test(t)) || a.isMacro === true
  if (!allow) return { ok: false, reason: 'not_ops_or_public' }

  const content = [`Help: ${a.title}`, `tags=${a.tags.join(',')}`, '', a.body].join('\n')
  const r = await upsertKnowledgeChunk({
    section: 'help',
    domain: a.tags[0] ?? 'ops',
    sourceType: 'help_article',
    sourceRef: a.id,
    content,
    shareScope: 'GLOBAL',
    metadata: { slug: a.slug, tags: a.tags, public: a.public },
  })
  if ('rejected' in r) return { ok: false, reason: r.reason }
  return { ok: true }
}

/** Keyword / ILIKE retrieve — vector search TODO when embeddings exist. */
export async function retrieveKnowledgeChunks(input: {
  query: string
  section?: string | null
  productLine?: string | null
  /** Echo instances only get GLOBAL (+ optional COHORT) — never ACCOUNT guest data. */
  shareScopes?: EchoShareScope[]
  limit?: number
}): Promise<
  Array<{
    id: string
    section: string
    domain: string | null
    sourceType: string
    contentRedacted: string
    productLine: string | null
    shareScope: string
    score: number
  }>
> {
  const q = redactSensitive(input.query, 200).trim()
  if (q.length < 2) return []

  const scopes = (input.shareScopes ?? (['GLOBAL', 'COHORT'] as EchoShareScope[])).filter(
    (s) => s === 'GLOBAL' || s === 'COHORT'
  )
  // Never return ACCOUNT chunks on fleet retrieve — tenant isolation.
  if (scopes.length === 0) return []
  const limit = Math.min(input.limit ?? 8, 20)
  const tokens = q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .slice(0, 6)

  const rows = await db.echoKnowledgeChunk.findMany({
    where: {
      shareScope: { in: scopes },
      ...(input.section ? { section: input.section } : {}),
      ...(input.productLine ? { productLine: input.productLine } : {}),
      OR:
        tokens.length > 0
          ? tokens.map((t) => ({
              contentRedacted: { contains: t, mode: 'insensitive' as const },
            }))
          : [{ contentRedacted: { contains: q.slice(0, 40), mode: 'insensitive' as const } }],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit * 3,
  })

  const scored = rows.map((r) => {
    const lower = r.contentRedacted.toLowerCase()
    let score = 0
    for (const t of tokens) {
      if (lower.includes(t)) score += 1
    }
    if (r.shareScope === 'GLOBAL') score += 0.25
    return {
      id: r.id,
      section: r.section,
      domain: r.domain,
      sourceType: r.sourceType,
      contentRedacted: r.contentRedacted.slice(0, 2000),
      productLine: r.productLine,
      shareScope: r.shareScope,
      score,
    }
  })

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

export async function learningPlaneStats(): Promise<{
  chunks: number
  bySection: { section: string; count: number }[]
  lastIngestAt: string | null
  lastSignalAt: string | null
  piiScrubActive: true
  embeddingsEnabled: false
}> {
  const [chunks, grouped, latestChunk, latestSignal] = await Promise.all([
    db.echoKnowledgeChunk.count(),
    db.echoKnowledgeChunk.groupBy({
      by: ['section'],
      _count: { _all: true },
    }),
    db.echoKnowledgeChunk.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
    db.knowledgeSignal.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])
  return {
    chunks,
    bySection: grouped.map((g) => ({ section: g.section, count: g._count._all })),
    lastIngestAt: latestChunk?.updatedAt.toISOString() ?? null,
    lastSignalAt: latestSignal?.createdAt.toISOString() ?? null,
    piiScrubActive: true,
    embeddingsEnabled: false,
  }
}

/** After runbook promote / pattern resolve — queue learning ingest (non-blocking). */
export async function queueLearnFromRunbook(runbookId: string): Promise<void> {
  await enqueueIngestJob({
    kind: 'echo_learn_from_runbook',
    payload: { runbookId },
    dedupeKey: `learn:runbook:${runbookId}`,
  })
}

export async function queueLearnFromPattern(patternId: string): Promise<void> {
  await enqueueIngestJob({
    kind: 'echo_learn_from_pattern',
    payload: { patternId },
    dedupeKey: `learn:pattern:${patternId}`,
  })
}

export async function queueLearnFromHelp(articleId: string): Promise<void> {
  await enqueueIngestJob({
    kind: 'echo_learn_from_help',
    payload: { articleId },
    dedupeKey: `learn:help:${articleId}`,
  })
}

/** Drain a small batch of pending ingest jobs (learning + agent). Call after resolve. */
export async function drainLearningQueue(limit = 8): Promise<{
  processed: number
  done: number
  failed: number
}> {
  return processIngestJobs(limit)
}

/**
 * One-shot / admin backfill from existing PROMOTED runbooks, GLOBAL/COHORT
 * patterns, and ops/public Help Files. Sync ingest so UI fills without waiting
 * for cron. Idempotent via sourceRef upserts.
 */
export async function backfillLearningPlane(opts?: {
  limit?: number
}): Promise<{
  runbooks: { ok: number; skipped: number }
  patterns: { ok: number; skipped: number }
  help: { ok: number; skipped: number }
  chunksAfter: number
  signalsAfter: number
}> {
  const limit = Math.min(opts?.limit ?? 200, 500)

  const runbooks = await db.knightRunbook.findMany({
    where: { status: 'PROMOTED' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true },
  })
  let rbOk = 0
  let rbSkip = 0
  for (const rb of runbooks) {
    const r = await ingestRunbookChunk(rb.id)
    if (r.ok) rbOk += 1
    else rbSkip += 1
  }

  const patterns = await db.errorPattern.findMany({
    where: { errorScope: { in: ['GLOBAL', 'COHORT'] } },
    orderBy: { lastSeenAt: 'desc' },
    take: limit,
    select: { id: true },
  })
  let patOk = 0
  let patSkip = 0
  for (const p of patterns) {
    const r = await ingestErrorPatternChunk(p.id)
    if (r.ok) patOk += 1
    else patSkip += 1
  }

  const help = await db.helpArticle.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true },
  })
  let helpOk = 0
  let helpSkip = 0
  for (const h of help) {
    const r = await ingestHelpArticleChunk(h.id)
    if (r.ok) helpOk += 1
    else helpSkip += 1
  }

  // Clear any leftover embed placeholder jobs from upserts.
  await processIngestJobs(15).catch(() => {})

  const [chunksAfter, signalsAfter] = await Promise.all([
    db.echoKnowledgeChunk.count(),
    db.knowledgeSignal.count(),
  ])

  await audit('computer_agent', 'echo.knowledge.backfill', undefined, {
    runbooks: { ok: rbOk, skipped: rbSkip },
    patterns: { ok: patOk, skipped: patSkip },
    help: { ok: helpOk, skipped: helpSkip },
    chunksAfter,
    signalsAfter,
  })

  return {
    runbooks: { ok: rbOk, skipped: rbSkip },
    patterns: { ok: patOk, skipped: patSkip },
    help: { ok: helpOk, skipped: helpSkip },
    chunksAfter,
    signalsAfter,
  }
}
