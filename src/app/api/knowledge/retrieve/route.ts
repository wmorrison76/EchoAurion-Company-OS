import { z } from 'zod'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import { knowledgeIngestAuthorized } from '@/lib/knowledge-ingest'
import { retrieveKnowledgeChunks } from '@/lib/echo-learning'
import { verifyRequestHandshake } from '@/lib/request-handshake'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  query: z.string().min(2).max(400),
  section: z.string().max(40).optional().nullable(),
  productLine: z.string().max(64).optional().nullable(),
  limit: z.number().int().min(1).max(20).optional(),
  clientKey: z.string().max(200).optional().nullable(),
})

/**
 * POST /api/knowledge/retrieve
 * Echo instances call with ECHO_AI_KEY / KNOWLEDGE_INGEST_SECRET.
 * Returns GLOBAL + COHORT chunks only (never ACCOUNT guest data).
 * Triple handshake when X-Echo-* headers present (see SECURITY_RELAY.md).
 */
export async function POST(req: Request): Promise<Response> {
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

  const rawBody = await req.text()
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON', code: 'SCHEMA' },
      { status: 400 }
    )
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { success: false, error: 'Invalid retrieve payload', code: 'SCHEMA' },
      { status: 400 }
    )
  }

  const callerKey = parsed.data.clientKey?.trim() || 'retrieve'
  const hs = await verifyRequestHandshake({
    req,
    route: 'knowledge.retrieve',
    clientKey: callerKey === 'retrieve' ? null : callerKey,
    rawBody,
  })
  if (!hs.ok) {
    return Response.json(
      { success: false, error: hs.error, code: hs.code, label: '✕ Handshake failed' },
      { status: hs.status }
    )
  }

  const throttle = allowIngestThrottle({ scope: 'knowledge', clientKey: callerKey })
  if (!throttle.ok) return throttleResponse(throttle)

  try {
    const chunks = await retrieveKnowledgeChunks({
      query: parsed.data.query,
      section: parsed.data.section,
      productLine: parsed.data.productLine,
      shareScopes: ['GLOBAL', 'COHORT'],
      limit: parsed.data.limit,
    })

    await audit('computer_agent', 'echo.knowledge.retrieve', undefined, {
      clientKey: callerKey,
      hitCount: chunks.length,
      queryLen: parsed.data.query.length,
    }).catch(() => {})

    return Response.json({
      success: true,
      data: {
        chunks,
        embeddingsEnabled: false,
        piiScrubActive: true,
        label: '✓ PII scrub active · keyword retrieve · GLOBAL/COHORT only',
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
