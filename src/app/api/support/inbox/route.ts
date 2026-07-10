import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { classifySupportRequest } from '@/lib/support-policy'
import type { APIResponse } from '@/types'
import type { ComplexityTier } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

export type InboxItemKind = 'question' | 'work'

export interface InboxItem {
  id: string
  kind: InboxItemKind
  title: string
  detail: string
  clientKey: string
  clientLabel: string | null
  status: string
  createdAt: string
  needsTriage: boolean
  policy: {
    recommendation: string
    shape: string
    label: string
    operatorHint: string
    suggestedTier: ComplexityTier | null
  }
  href: string
}

/**
 * Unified Support inbox: open questions + work needing Approve free / Quote.
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const [questions, work] = await Promise.all([
      db.customerQuestion.findMany({
        where: { status: { in: ['NEW', 'DRAFTED'] } },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      db.workRequest.findMany({
        where: { status: { in: ['RECEIVED', 'QUOTED'] } },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    ])

    const clientIds = [
      ...new Set(
        [...questions, ...work]
          .map((i) => ('clientId' in i ? i.clientId : null))
          .filter(Boolean) as string[]
      ),
    ]
    const clients = clientIds.length
      ? await db.supportClient.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, label: true },
        })
      : []
    const labelById = new Map(clients.map((c) => [c.id, c.label]))

    const items: InboxItem[] = []

    for (const q of questions) {
      const verdict = classifySupportRequest({
        kind: 'QUESTION',
        title: q.question.slice(0, 80),
        detail: q.question,
      })
      items.push({
        id: q.id,
        kind: 'question',
        title: q.question.slice(0, 120),
        detail: q.question,
        clientKey: q.clientKey,
        clientLabel: q.clientId ? labelById.get(q.clientId) ?? null : null,
        status: q.status,
        createdAt: q.createdAt.toISOString(),
        needsTriage: q.status === 'NEW' || q.status === 'DRAFTED',
        policy: {
          recommendation: verdict.recommendation,
          shape: verdict.shape,
          label: verdict.label,
          operatorHint: verdict.operatorHint,
          suggestedTier: verdict.suggestedTier,
        },
        href: '/support#questions',
      })
    }

    for (const w of work) {
      const verdict = classifySupportRequest({
        kind: w.kind,
        title: w.title,
        detail: w.detail,
      })
      items.push({
        id: w.id,
        kind: 'work',
        title: w.title,
        detail: w.detail,
        clientKey: w.clientKey,
        clientLabel: w.clientId ? labelById.get(w.clientId) ?? null : null,
        status: w.status,
        createdAt: w.createdAt.toISOString(),
        needsTriage: w.status === 'RECEIVED' || w.status === 'QUOTED',
        policy: {
          recommendation: verdict.recommendation,
          shape: verdict.shape,
          label: verdict.label,
          operatorHint: verdict.operatorHint,
          suggestedTier: verdict.suggestedTier,
        },
        href: '/support#work',
      })
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return Response.json({
      success: true,
      data: {
        items,
        counts: {
          questions: questions.length,
          work: work.length,
          total: items.length,
        },
      },
    } satisfies APIResponse<{
      items: InboxItem[]
      counts: { questions: number; work: number; total: number }
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Inbox query failed',
      },
      { status: 500 }
    )
  }
}
