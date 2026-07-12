import { z } from 'zod'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import { knowledgeIngestAuthorized, findForbiddenPiiKey } from '@/lib/knowledge-ingest'
import { redactSensitive } from '@/lib/error-redact'
import { upsertKnowledgeChunk } from '@/lib/echo-learning'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  section: z
    .enum(['ops', 'hospitality', 'runbook', 'help', 'error_pattern', 'procedure', 'domain'])
    .default('procedure'),
  domain: z.string().max(80).optional().nullable(),
  productLine: z.string().max(64).optional().nullable(),
  /** Pre-extracted text only — never store raw PDF bytes. */
  text: z.string().min(20).max(100_000),
  title: z.string().max(200).optional().nullable(),
  sourceRef: z.string().max(200).optional().nullable(),
})

/**
 * POST /api/knowledge/book-ingest
 * Stub for PDF/book → cleaned chunks only. Caller must extract text first;
 * we redact + PII-key reject + store GLOBAL procedure chunks.
 * Does NOT persist raw uploads.
 */
export async function POST(req: Request): Promise<Response> {
  const a = knowledgeIngestAuthorized(req)
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code, label: '✕ Unauthorized' },
      { status: a.status }
    )
  }

  const throttle = allowIngestThrottle({ scope: 'knowledge', clientKey: 'book-ingest' })
  if (!throttle.ok) return throttleResponse(throttle)

  try {
    const raw: unknown = await req.json()
    const pii = findForbiddenPiiKey(raw)
    if (pii) {
      return Response.json(
        {
          success: false,
          error: `PII-like field rejected: ${pii}`,
          code: 'PII_REJECTED',
          label: '✕ PII rejected',
        },
        { status: 400 }
      )
    }

    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid book-ingest payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }

    const cleaned = redactSensitive(parsed.data.text, 50_000)
    // Chunk ~2.5k chars for retrieve friendliness.
    const size = 2500
    const ids: string[] = []
    for (let i = 0, part = 0; i < cleaned.length; i += size, part += 1) {
      const slice = cleaned.slice(i, i + size)
      if (slice.trim().length < 40) continue
      const content = [
        parsed.data.title ? `Title: ${parsed.data.title}` : null,
        `Part ${part + 1}`,
        '',
        slice,
      ]
        .filter(Boolean)
        .join('\n')

      const r = await upsertKnowledgeChunk({
        section: parsed.data.section,
        domain: parsed.data.domain ?? 'hospitality',
        sourceType: 'pdf_book',
        sourceRef: `${parsed.data.sourceRef ?? parsed.data.title ?? 'book'}:p${part}`,
        content,
        productLine: parsed.data.productLine ?? null,
        shareScope: 'GLOBAL',
        metadata: { title: parsed.data.title ?? null, part },
      })
      if ('id' in r) ids.push(r.id)
    }

    await audit('computer_agent', 'echo.knowledge.book_ingest', undefined, {
      chunks: ids.length,
      title: parsed.data.title ?? null,
    })

    return Response.json(
      {
        success: true,
        data: {
          chunkIds: ids,
          count: ids.length,
          label: '✓ Book chunks stored (redacted · no raw upload)',
        },
      } satisfies APIResponse<{ chunkIds: string[]; count: number; label: string }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'book-ingest failed',
        label: '✕ Book ingest failed',
      },
      { status: 500 }
    )
  }
}
