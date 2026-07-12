import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import {
  findForbiddenPiiKey,
  knowledgeIngestAuthorized,
  knowledgeIngestSchema,
} from '@/lib/knowledge-ingest'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import { verifyRequestHandshake } from '@/lib/request-handshake'
import { assertRegisteredOrSystemClient } from '@/lib/tenant-isolation'
import { redactSensitive } from '@/lib/error-redact'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

function redactPayloadLeaves(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitive(value, 2000)
  if (Array.isArray(value)) return value.map(redactPayloadLeaves)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactPayloadLeaves(v)
    }
    return out
  }
  return value
}

/**
 * POST /api/knowledge/ingest — Echo AI³ → Aurion Knowledge Plane.
 * Bearer KNOWLEDGE_INGEST_SECRET (or SUPPORT_INGEST_SECRET). Rejects PII keys.
 * Handshake Layer 3 when X-Echo-* present.
 */
export async function POST(req: Request): Promise<Response> {
  const a = knowledgeIngestAuthorized(req)
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }

  try {
    const rawBody = await req.text()
    let raw: unknown
    try {
      raw = JSON.parse(rawBody)
    } catch {
      return Response.json(
        { success: false, error: 'Invalid JSON', code: 'SCHEMA' },
        { status: 400 }
      )
    }

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

    const parsed = knowledgeIngestSchema.safeParse(raw)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid knowledge signal schema', code: 'SCHEMA' },
        { status: 400 }
      )
    }

    const d = parsed.data
    const hs = await verifyRequestHandshake({
      req,
      route: 'knowledge.ingest',
      clientKey: d.clientKey,
      rawBody,
    })
    if (!hs.ok) {
      return Response.json(
        { success: false, error: hs.error, code: hs.code, label: '✕ Handshake failed' },
        { status: hs.status }
      )
    }

    await assertRegisteredOrSystemClient(d.clientKey)

    const throttle = allowIngestThrottle({
      scope: 'knowledge',
      clientKey: d.clientKey,
    })
    if (!throttle.ok) return throttleResponse(throttle)

    const payloadPii = findForbiddenPiiKey(d.payload)
    if (payloadPii) {
      return Response.json(
        {
          success: false,
          error: `PII-like field rejected in payload: ${payloadPii}`,
          code: 'PII_REJECTED',
          label: '✕ PII rejected',
        },
        { status: 400 }
      )
    }

    const scrubbedPayload = redactPayloadLeaves(d.payload) as Prisma.InputJsonValue

    const created = await db.knowledgeSignal.create({
      data: {
        clientKey: d.clientKey,
        schemaVersion: d.schemaVersion,
        signalType: d.signalType,
        territoryCode: d.territoryCode ?? null,
        aggregationLevel: d.aggregationLevel,
        windowStart: d.windowStart ? new Date(d.windowStart) : null,
        windowEnd: d.windowEnd ? new Date(d.windowEnd) : null,
        payload: scrubbedPayload,
        sampleSize: d.sampleSize ?? null,
        confidence: d.confidence ?? null,
      },
    })

    await audit('computer_agent', 'knowledge.signal.ingest', created.id, {
      signalType: d.signalType,
      aggregationLevel: d.aggregationLevel,
      clientKey: d.clientKey,
    })

    return Response.json(
      {
        success: true,
        data: { id: created.id, accepted: true, label: '✓ Knowledge signal accepted' },
      } satisfies APIResponse<{ id: string; accepted: boolean; label: string }>,
      { status: 202 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Knowledge ingest failed',
        label: '✕ Knowledge ingest failed',
      },
      { status: 500 }
    )
  }
}
