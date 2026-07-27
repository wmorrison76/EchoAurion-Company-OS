import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/** Admin view: counts + meta only — not raw payload dumps. */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const [total, byType, recent] = await Promise.all([
      db.knowledgeSignal.count(),
      db.knowledgeSignal.groupBy({
        by: ['signalType'],
        _count: { _all: true },
      }),
      db.knowledgeSignal.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          signalType: true,
          aggregationLevel: true,
          territoryCode: true,
          sampleSize: true,
          confidence: true,
          createdAt: true,
        },
      }),
    ])

    const data = {
      total,
      byType: byType.map((g) => ({
        signalType: g.signalType,
        count: g._count._all,
      })),
      recent: recent.map((r) => ({
        id: r.id,
        signalType: r.signalType,
        aggregationLevel: r.aggregationLevel,
        territoryCode: r.territoryCode,
        sampleSize: r.sampleSize,
        confidence: r.confidence,
        createdAt: r.createdAt.toISOString(),
      })),
    }

    return Response.json({ success: true, data } satisfies APIResponse<typeof data>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Signals query failed',
      },
      { status: 500 }
    )
  }
}
