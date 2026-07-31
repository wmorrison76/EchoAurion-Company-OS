import { db } from '@/lib/db'
import { relayAuthorized, requireClientKey } from '@/lib/relay-auth'
import {
  parseRelayUserId,
  userIdContextEquals,
} from '@/lib/relay-question-scope'
import { buildCustomerThreadMeta } from '@/lib/customer-thread-meta'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

interface DeliverableAnswer {
  id: string
  ticketId: string | null
  question: string
  answer: string | null
  directive: unknown
  userId: string | null
  createdAt: string
  answeredAt: string | null
  intakeGate: string | null
  closeReason: string | null
  disposition: string | null
  fixSha: string | null
  etaLabel: string | null
  followUps: Array<{ body: string; createdAt: string }>
  statusBadge: {
    shape: string
    label: string
    level: 'ok' | 'warn' | 'unknown'
  } | null
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

    const tickets = await db.helpTicket.findMany({
      where: { customerQuestionId: { in: pending.map((p) => p.id) } },
      select: {
        id: true,
        customerQuestionId: true,
        closeReason: true,
        status: true,
        subject: true,
        needsHumanCoreReview: true,
        intakeGate: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, body: true, createdAt: true },
        },
      },
    })
    const ticketByQuestion = new Map(
      tickets
        .filter((t) => t.customerQuestionId)
        .map((t) => [t.customerQuestionId!, t])
    )

    const data: DeliverableAnswer[] = pending.map((p) => {
      const ctx =
        p.context && typeof p.context === 'object' && !Array.isArray(p.context)
          ? (p.context as Record<string, unknown>)
          : null
      const ticket = ticketByQuestion.get(p.id)
      const staffBodies =
        ticket?.messages
          .filter((m) => m.role === 'KNIGHT' || m.role === 'ADMIN')
          .map((m) => m.body)
          .slice(-4) ?? []
      const customerMsgs =
        ticket?.messages.filter((m) => m.role === 'CUSTOMER') ?? []
      const followUps = customerMsgs.slice(1).map((m) => ({
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      }))
      const meta = buildCustomerThreadMeta({
        intakeGate: p.intakeGate ?? ticket?.intakeGate ?? null,
        questionStatus: p.status,
        replyState: 'replied',
        closeReason: ticket?.closeReason ?? null,
        answer: p.answer,
        subject: ticket?.subject ?? p.question,
        needsHumanCoreReview: ticket?.needsHumanCoreReview ?? null,
        ticketStatus: ticket?.status ?? null,
        messageBodies: staffBodies,
      })
      return {
        id: p.id,
        ticketId: ticket?.id ?? null,
        question: customerMsgs[0]?.body ?? p.question,
        answer: p.answer,
        directive: p.directive,
        userId: typeof ctx?.userId === 'string' ? ctx.userId : userId,
        createdAt: p.createdAt.toISOString(),
        answeredAt: p.answeredAt?.toISOString() ?? null,
        intakeGate: p.intakeGate ?? null,
        closeReason: meta.closeReason,
        disposition: meta.disposition,
        fixSha: meta.fixSha,
        etaLabel: meta.etaLabel,
        followUps,
        statusBadge: meta.statusBadge,
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
