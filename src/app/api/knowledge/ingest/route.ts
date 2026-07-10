import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import {
  findForbiddenPiiKey,
  knowledgeIngestAuthorized,
  knowledgeIngestSchema,
} from '@/lib/knowledge-ingest'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/knowledge/ingest — Echo AI³ → Aurion Knowledge Plane.
 * Bearer KNOWLEDGE_INGEST_SECRET (or SUPPORT_INGEST_SECRET). Rejects PII keys.
 */
export async function POST(req: Request): Promise<Response> {
  const a = knowledgeIngestAuthorized(req)
  if (!a.ok) {
    return Response.json({ success: false, error: a.error }, { status: a.status })
  }

  try {
    const raw: unknown = await req.json()
    const pii = findForbiddenPiiKey(raw)
    if (pii) {
      return Response.json(
        {
          success: false,
          error: `PII-like field rejected: ${pii}`,
          code: 'PII_REJECTED',
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
    const payloadPii = findForbiddenPiiKey(d.payload)
    if (payloadPii) {
      return Response.json(
        {
          success: false,
          error: `PII-like field rejected in payload: ${payloadPii}`,
          code: 'PII_REJECTED',
        },
        { status: 400 }
      )
    }

    const created = await db.knowledgeSignal.create({
      data: {
        clientKey: d.clientKey,
        schemaVersion: d.schemaVersion,
        signalType: d.signalType,
        territoryCode: d.territoryCode ?? null,
        aggregationLevel: d.aggregationLevel,
        windowStart: d.windowStart ? new Date(d.windowStart) : null,
        windowEnd: d.windowEnd ? new Date(d.windowEnd) : null,
        payload: d.payload as Prisma.InputJsonValue,
        sampleSize: d.sampleSize ?? null,
        confidence: d.confidence ?? null,
      },
    })

    await audit('computer_agent', 'knowledge.signal.ingest', created.id, {
      signalType: d.signalType,
      aggregationLevel: d.aggregationLevel,
    })

    return Response.json(
      {
        success: true,
        data: { id: created.id, accepted: true },
      } satisfies APIResponse<{ id: string; accepted: boolean }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Knowledge ingest failed',
      },
      { status: 500 }
    )
  }
}
