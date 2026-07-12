/**
 * Echo Learning Plane — PII-safe knowledge chunks for Company OS / Dr. OS.
 * Text + metadata first; embeddings optional (Neon pgvector TODO).
 * See docs/ECHO_LEARNING_PLANE.md
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { redactSensitive } from '@/lib/error-redact'
import { findForbiddenPiiKey } from '@/lib/knowledge-ingest'
import { enqueueIngestJob } from '@/lib/ingest-queue'

export type EchoKnowledgeSection =
  | 'ops'
  | 'hospitality'
  | 'runbook'
  | 'help'
  | 'error_pattern'
  | 'procedure'
  | 'domain'

export type EchoShareScope = 'GLOBAL' | 'COHORT' | 'ACCOUNT'

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
  const contentRedacted = redactSensitive(input.content, 8000)
  if (!contentRedacted.trim()) {
    return { rejected: true, reason: 'empty_after_redact' }
  }
  const pii = findForbiddenPiiKey({
    ...input.metadata,
    body: contentRedacted,
  })
  if (pii) {
    return { rejected: true, reason: `pii_key:${pii}` }
  }

  const shareScope = input.shareScope ?? (input.clientKey ? 'ACCOUNT' : 'GLOBAL')
  // ACCOUNT-scoped guest/property free-text must never land as GLOBAL teachable.
  if (shareScope === 'ACCOUNT' && !input.clientKey) {
    return { rejected: true, reason: 'account_requires_client_key' }
  }

  if (input.sourceRef) {
    const existing = await db.echoKnowledgeChunk.findFirst({
      where: {
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        section: input.section,
      },
    })
    if (existing) {
      await db.echoKnowledgeChunk.update({
        where: { id: existing.id },
        data: {
          contentRedacted,
          domain: input.domain ?? existing.domain,
          metadata: (input.metadata ?? existing.metadata) as object | undefined,
          productLine: input.productLine ?? existing.productLine,
          clientKey: input.clientKey ?? existing.clientKey,
          shareScope,
        },
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
      clientKey: shareScope === 'GLOBAL' || shareScope === 'COHORT' ? null : input.clientKey,
      shareScope,
      embedding: undefined,
    },
  })

  await audit('computer_agent', 'echo.knowledge.chunk.upsert', row.id, {
    section: input.section,
    sourceType: input.sourceType,
    shareScope,
  })

  // Embed later via queue (no-op until pgvector).
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

  const r = await upsertKnowledgeChunk({
    section: 'error_pattern',
    domain: p.errorCategory,
    sourceType: 'error_pattern',
    sourceRef: p.id,
    content,
    productLine: p.productLine,
    shareScope: p.errorScope === 'GLOBAL' || p.errorScope === 'COHORT' ? 'GLOBAL' : 'COHORT',
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

  // Only ops/public-ish tags — skip anything tagged private/crm/investor.
  const blocked = a.tags.some((t) =>
    /private|crm|investor|pii|guest|staff/i.test(t)
  )
  if (blocked) return { ok: false, reason: 'tag_blocked' }

  const content = [`Help: ${a.title}`, `tags=${a.tags.join(',')}`, '', a.body].join('\n')
  const r = await upsertKnowledgeChunk({
    section: 'help',
    domain: a.tags[0] ?? 'ops',
    sourceType: 'help_article',
    sourceRef: a.id,
    content,
    shareScope: 'GLOBAL',
    metadata: { slug: a.slug, tags: a.tags },
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

  const scopes = input.shareScopes ?? (['GLOBAL', 'COHORT'] as EchoShareScope[])
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
  piiScrubActive: true
  embeddingsEnabled: false
}> {
  const chunks = await db.echoKnowledgeChunk.count()
  const grouped = await db.echoKnowledgeChunk.groupBy({
    by: ['section'],
    _count: { _all: true },
  })
  return {
    chunks,
    bySection: grouped.map((g) => ({ section: g.section, count: g._count._all })),
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
