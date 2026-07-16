/**
 * DB-backed job queue for expensive ingest side-effects.
 * Under a 5k-tenant stampede: ticket create/dedupe stays sync + cheap;
 * Knights / Architect / fleet notify / learning embed are async.
 * See docs/SCALE_AND_THROTTLE.md
 */

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

export type IngestJobKind =
  | 'agent_loop'
  | 'notify_fanout'
  | 'knowledge_embed'
  | 'echo_learn_from_runbook'
  | 'echo_learn_from_pattern'
  | 'echo_learn_from_help'

export type IngestJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'

const DEFAULT_BATCH = 8
const MAX_ATTEMPTS = 5

export async function enqueueIngestJob(input: {
  kind: IngestJobKind
  payload: Record<string, unknown>
  /** Dedupe key — same kind+dedupeKey PENDING/RUNNING → skip enqueue. */
  dedupeKey?: string | null
  runAfter?: Date
}): Promise<{ id: string; created: boolean }> {
  if (input.dedupeKey) {
    const existing = await db.ingestJob.findFirst({
      where: {
        kind: input.kind,
        dedupeKey: input.dedupeKey,
        status: { in: ['PENDING', 'RUNNING'] },
      },
      select: { id: true },
    })
    if (existing) return { id: existing.id, created: false }
  }

  const row = await db.ingestJob.create({
    data: {
      kind: input.kind,
      payload: input.payload as Prisma.InputJsonValue,
      dedupeKey: input.dedupeKey ?? null,
      status: 'PENDING',
      runAfter: input.runAfter ?? new Date(),
    },
  })
  return { id: row.id, created: true }
}

async function markDone(id: string): Promise<void> {
  await db.ingestJob.update({
    where: { id },
    data: { status: 'DONE', lockedAt: null, lastError: null },
  })
}

async function markFailed(id: string, attempts: number, err: string): Promise<void> {
  const retry = attempts < MAX_ATTEMPTS
  await db.ingestJob.update({
    where: { id },
    data: {
      status: retry ? 'PENDING' : 'FAILED',
      attempts,
      lockedAt: null,
      lastError: err.slice(0, 500),
      runAfter: retry
        ? new Date(Date.now() + Math.min(60_000 * 2 ** attempts, 15 * 60_000))
        : new Date(),
    },
  })
}

async function runOne(job: {
  id: string
  kind: string
  payload: Prisma.JsonValue
  attempts: number
}): Promise<void> {
  const payload = (job.payload ?? {}) as Record<string, unknown>
  try {
    if (job.kind === 'agent_loop') {
      const ticketId = String(payload.ticketId ?? '')
      if (!ticketId) throw new Error('missing ticketId')
      const { queueAgentAndKnights } = await import('@/lib/error-agent-loop')
      await queueAgentAndKnights(ticketId)
    } else if (job.kind === 'notify_fanout') {
      const ticketId = String(payload.ticketId ?? '')
      if (!ticketId) throw new Error('missing ticketId')
      const { notifyErrorFixedBatched } = await import('@/lib/error-notify')
      await notifyErrorFixedBatched(ticketId, {
        offset: typeof payload.offset === 'number' ? payload.offset : 0,
        chunkSize: typeof payload.chunkSize === 'number' ? payload.chunkSize : 40,
      })
    } else if (job.kind === 'echo_learn_from_runbook') {
      const { ingestRunbookChunk } = await import('@/lib/echo-learning')
      await ingestRunbookChunk(String(payload.runbookId ?? ''))
    } else if (job.kind === 'echo_learn_from_pattern') {
      const { ingestErrorPatternChunk } = await import('@/lib/echo-learning')
      await ingestErrorPatternChunk(String(payload.patternId ?? ''))
    } else if (job.kind === 'echo_learn_from_help') {
      const { ingestHelpArticleChunk } = await import('@/lib/echo-learning')
      await ingestHelpArticleChunk(String(payload.articleId ?? ''))
    } else if (job.kind === 'knowledge_embed') {
      // Placeholder — embeddings deferred until Neon pgvector enabled.
      await audit('computer_agent', 'echo.knowledge.embed.skip', undefined, {
        reason: 'embeddings_not_enabled',
        chunkId: payload.chunkId ?? null,
      })
    } else {
      throw new Error(`unknown kind ${job.kind}`)
    }
    await markDone(job.id)
  } catch (err) {
    await markFailed(
      job.id,
      job.attempts + 1,
      err instanceof Error ? err.message : 'job_failed'
    )
  }
}

/**
 * Claim and process a batch of due jobs. Safe to call from cron every minute.
 * Concurrency is sequential within the batch to protect Neon + LLM budgets.
 */
export async function processIngestJobs(limit = DEFAULT_BATCH): Promise<{
  processed: number
  done: number
  failed: number
}> {
  const now = new Date()
  const due = await db.ingestJob.findMany({
    where: {
      status: 'PENDING',
      runAfter: { lte: now },
    },
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit, 25),
  })

  let done = 0
  let failed = 0

  for (const job of due) {
    const claimed = await db.ingestJob.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'RUNNING', lockedAt: now, attempts: { increment: 0 } },
    })
    if (claimed.count === 0) continue

    const before = await db.ingestJob.findUnique({ where: { id: job.id } })
    await runOne({
      id: job.id,
      kind: job.kind,
      payload: job.payload,
      attempts: before?.attempts ?? job.attempts,
    })
    const after = await db.ingestJob.findUnique({ where: { id: job.id } })
    if (after?.status === 'DONE') done += 1
    else if (after?.status === 'FAILED' || after?.status === 'PENDING') failed += 1
  }

  await audit('computer_agent', 'ingest_queue.process', undefined, {
    claimed: due.length,
    done,
    failed,
  }).catch(() => {})

  return { processed: due.length, done, failed }
}

export async function ingestQueueStats(): Promise<{
  pending: number
  running: number
  failed: number
}> {
  const [pending, running, failed] = await Promise.all([
    db.ingestJob.count({ where: { status: 'PENDING' } }),
    db.ingestJob.count({ where: { status: 'RUNNING' } }),
    db.ingestJob.count({ where: { status: 'FAILED' } }),
  ])
  return { pending, running, failed }
}
