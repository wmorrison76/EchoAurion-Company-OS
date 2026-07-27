import { z } from 'zod'
import { relayGuard, requireClientKey } from '@/lib/relay-auth'
import { enforcePerTenantSecretIfSet } from '@/lib/tenant-ingest-secret'
import { submitCsatScore } from '@/lib/support-csat'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * Property UI submits post-resolve CSAT (1–5).
 * Auth: SUPPORT_INGEST_SECRET (+ optional per-tenant hash).
 */

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  ticketId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
})

export async function POST(req: Request): Promise<Response> {
  const a = relayGuard(req, 'default')
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }

  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid CSAT payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }

    const key = requireClientKey(parsed.data.clientKey)
    if (!key.ok) {
      return Response.json(
        { success: false, error: key.error, code: key.code },
        { status: key.status }
      )
    }

    const tenant = await enforcePerTenantSecretIfSet({
      clientKey: key.clientKey,
      req,
      sharedOk: true,
    })
    if (!tenant.ok) {
      return Response.json(
        { success: false, error: tenant.error, code: tenant.code },
        { status: tenant.status }
      )
    }

    const result = await submitCsatScore({
      ticketId: parsed.data.ticketId,
      clientKey: key.clientKey,
      score: parsed.data.score,
      comment: parsed.data.comment,
      actor: 'computer_agent',
    })

    if (!result.ok) {
      return Response.json(
        { success: false, error: result.error, code: 'CSAT_REJECTED' },
        { status: result.status }
      )
    }

    return Response.json({
      success: true,
      data: { ticketId: parsed.data.ticketId, score: parsed.data.score },
    } satisfies APIResponse<{ ticketId: string; score: number }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'CSAT submit failed',
      },
      { status: 500 }
    )
  }
}
