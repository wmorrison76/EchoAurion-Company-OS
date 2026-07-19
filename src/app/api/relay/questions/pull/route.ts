import { db } from '@/lib/db'
import { relayAuthorized, requireClientKey } from '@/lib/relay-auth'
import {
  parseRelayUserId,
  userIdContextEquals,
} from '@/lib/relay-question-scope'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

interface DeliverableAnswer {
  id: string
  question: string
  answer: string | null
  directive: unknown
  userId: string | null
}

/**
 * Pull fallback — SSE is preferred.
 * Returns ANSWERED & undelivered for this clientKey + userId only.
 * userId is REQUIRED (fail-closed) — never org-wide undelivered dump.
 */
export async function GET(req: Request): Promise<Response> {
  const a = relayAuthorized(req)
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }
  const url = new URL(req.url)
  const key = requireClientKey(url.searchParams.get('clientKey'))
  if (!key.ok) {
    return Response.json(
      { success: false, error: key.error, code: key.code },
      { status: key.status }
    )
  }
  const userId = parseRelayUserId(url.searchParams.get('userId'))
  if (!userId) {
    return Response.json({
      success: true,
      data: [] as DeliverableAnswer[],
      meta: { scoped: false, reason: 'userId_required' },
    })
  }
  try {
    const pending = await db.customerQuestion.findMany({
      where: {
        clientKey: key.clientKey,
        status: 'ANSWERED',
        delivered: false,
        context: userIdContextEquals(userId),
      },
      orderBy: { answeredAt: 'asc' },
    })
    if (pending.length > 0) {
      await db.customerQuestion.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { delivered: true },
      })
    }
    const data: DeliverableAnswer[] = pending.map((p) => {
      const ctx =
        p.context && typeof p.context === 'object' && !Array.isArray(p.context)
          ? (p.context as Record<string, unknown>)
          : null
      return {
        id: p.id,
        question: p.question,
        answer: p.answer,
        directive: p.directive,
        userId:
          typeof ctx?.userId === 'string' ? ctx.userId : userId,
      }
    })
    return Response.json({
      success: true,
      data,
      meta: { scoped: true, userId },
    } as APIResponse<DeliverableAnswer[]> & {
      meta: { scoped: boolean; userId: string }
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Pull failed',
        code: 'PULL_FAILED',
      },
      { status: 500 }
    )
  }
}
