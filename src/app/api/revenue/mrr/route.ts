import { auth } from '@/lib/auth'
import { calculateMRR } from '@/lib/stripe'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'
import type { MRRPoint } from '@/types/revenue'

export const dynamic = 'force-dynamic'

interface MRRResponse {
  mrr: number
  customerCount: number
  history: MRRPoint[]
}

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const [live, snaps] = await Promise.all([
      calculateMRR().catch(() => ({ mrr: 0, customerCount: 0 })),
      db.mRRSnapshot.findMany({ orderBy: { snappedAt: 'asc' }, take: 180 }).catch(() => []),
    ])
    const data: MRRResponse = {
      mrr: live.mrr,
      customerCount: live.customerCount,
      history: snaps.map((s) => ({ date: s.snappedAt.toISOString(), mrr: s.mrr })),
    }
    return Response.json({ success: true, data } satisfies APIResponse<MRRResponse>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'MRR failed' },
      { status: 500 }
    )
  }
}
