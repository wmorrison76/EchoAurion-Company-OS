import { z } from 'zod'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/** Align KPI + list: standby auto-answers awaiting William audit (rolling 7 days). */
const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface StandbyReviewItem {
  id: string
  clientKey: string
  question: string
  answer: string | null
  answeredAt: string | null
  ticketHint: string
}

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ack'), id: z.string().min(1) }),
  z.object({ action: z.literal('ack_all') }),
])

function reviewWhere(now = Date.now()) {
  return {
    standbyApproved: true as const,
    status: { not: 'DISMISSED' as const },
    answeredAt: { gte: new Date(now - REVIEW_WINDOW_MS) },
  }
}

/**
 * GET /api/support/standby/queue — “Standby approved — review queue” for William.
 *
 * These are Autopilot/standby successes (chat already sent), not failures.
 * Items stay until William acks or the 7-day window rolls off.
 * Ack does not undeploy code — Autopilot never merges/deploys.
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const rows = await db.customerQuestion.findMany({
      where: reviewWhere(),
      orderBy: { answeredAt: 'desc' },
      take: 50,
    })
    const data: StandbyReviewItem[] = rows.map((r) => ({
      id: r.id,
      clientKey: r.clientKey,
      question: r.question,
      answer: r.answer,
      answeredAt: r.answeredAt?.toISOString() ?? null,
      ticketHint: 'Standby approved — review queue',
    }))
    return Response.json({ success: true, data } satisfies APIResponse<StandbyReviewItem[]>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Standby queue failed',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/support/standby/queue
 * - ack: remove one auto-answer from the review queue (keeps ANSWERED + outbox history)
 * - ack_all: clear the rolling 7-day review window
 */
export async function PATCH(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid ack payload' }, { status: 400 })
    }

    if (parsed.data.action === 'ack') {
      const id = parsed.data.id
      const existing = await db.customerQuestion.findUnique({ where: { id } })
      if (!existing) {
        return Response.json({ success: false, error: 'Question not found' }, { status: 404 })
      }
      if (!existing.standbyApproved) {
        return Response.json({
          success: true,
          data: { id, cleared: 0, alreadyAcked: true },
        } satisfies APIResponse<{ id: string; cleared: number; alreadyAcked: boolean }>)
      }
      await db.customerQuestion.update({
        where: { id },
        data: { standbyApproved: false },
      })
      await audit('william_morrison', 'standby.review.ack', id, {
        clientKey: existing.clientKey,
      })
      return Response.json({
        success: true,
        data: { id, cleared: 1, alreadyAcked: false },
      } satisfies APIResponse<{ id: string; cleared: number; alreadyAcked: boolean }>)
    }

    const result = await db.customerQuestion.updateMany({
      where: reviewWhere(),
      data: { standbyApproved: false },
    })
    await audit('william_morrison', 'standby.review.ack_all', undefined, {
      cleared: result.count,
    })
    return Response.json({
      success: true,
      data: { cleared: result.count },
    } satisfies APIResponse<{ cleared: number }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Standby queue ack failed',
      },
      { status: 500 }
    )
  }
}
