import { z } from 'zod'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import { knowledgeIngestAuthorized } from '@/lib/knowledge-ingest'
import { retrieveKnowledgeChunks } from '@/lib/echo-learning'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  query: z.string().min(2).max(400),
  section: z.string().max(40).optional().nullable(),
  productLine: z.string().max(64).optional().nullable(),
  limit: z.number().int().min(1).max(20).optional(),
})

/**
 * POST /api/knowledge/retrieve
 * Echo instances call with ECHO_AI_KEY / KNOWLEDGE_INGEST_SECRET.
 * Returns GLOBAL + COHORT chunks only (never ACCOUNT guest data).
 * Keyword/ILIKE first — embeddings TODO (Neon pgvector).
 */
export async function POST(req: Request): Promise<Response> {
  // Accept knowledge ingest secret OR ECHO_AI_KEY (pilot ↔ hub).
  const a = knowledgeIngestAuthorized(req)
  const echoKey = process.env.ECHO_AI_KEY?.trim()
  const authz = req.headers.get('authorization') ?? ''
  const echoOk =
    echoKey &&
    /^Bearer\s+(.+)$/i.test(authz) &&
    authz.replace(/^Bearer\s+/i, '') === echoKey

  if (!a.ok && !echoOk) {
    return Response.json(
      {
        success: false,
        error: a.ok === false ? a.error : 'Unauthorized',
        code: 'UNAUTHORIZED',
        label: '✕ Unauthorized',
      },
      { status: 401 }
    )
  }

  const throttle = allowIngestThrottle({ scope: 'knowledge', clientKey: 'retrieve' })
  if (!throttle.ok) return throttleResponse(throttle)

  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid retrieve payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }

    const chunks = await retrieveKnowledgeChunks({
      query: parsed.data.query,
      section: parsed.data.section,
      productLine: parsed.data.productLine,
      shareScopes: ['GLOBAL', 'COHORT'],
      limit: parsed.data.limit,
    })

    return Response.json({
      success: true,
      data: {
        chunks,
        embeddingsEnabled: false,
        piiScrubActive: true,
        label: '✓ PII scrub active · keyword retrieve',
      },
    } satisfies APIResponse<{
      chunks: typeof chunks
      embeddingsEnabled: false
      piiScrubActive: true
      label: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'retrieve failed',
        label: '✕ Retrieve failed',
      },
      { status: 500 }
    )
  }
}
