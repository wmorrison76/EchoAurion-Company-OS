import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

/**
 * GET /api/financial/brex/summary
 *
 * Aggregated view of Brex activity for the Financial dashboard's BrexPanel.
 * Returns last-sync timestamp, 30-day card spend, and the 20 most recent
 * settled transactions.
 */

export const dynamic = 'force-dynamic'

interface BrexSummary {
  lastSyncedAt: string | null
  recent30dSpend: number
  transactions: Array<{
    id: string
    merchantName: string | null
    description: string | null
    amount: number
    postedAt: string
    category: string | null
  }>
}

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const [snapshot, txns, sum] = await Promise.all([
      db.brexSnapshot.findFirst({ orderBy: { snappedAt: 'desc' } }),
      db.brexTransaction.findMany({
        orderBy: { postedAt: 'desc' },
        take: 20,
      }),
      db.brexTransaction.aggregate({
        where: {
          accountType: 'card',
          postedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        _sum: { amount: true },
      }),
    ])

    const data: BrexSummary = {
      lastSyncedAt: snapshot?.snappedAt.toISOString() ?? null,
      recent30dSpend: sum._sum.amount ?? 0,
      transactions: txns.map((t) => ({
        id: t.id,
        merchantName: t.merchantName,
        description: t.description,
        amount: t.amount,
        postedAt: t.postedAt.toISOString(),
        category: t.category,
      })),
    }
    return Response.json({ success: true, data } satisfies APIResponse<BrexSummary>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Brex summary failed' },
      { status: 500 }
    )
  }
}
