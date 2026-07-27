import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const rows = await db.knowledgeInsight.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      insightClass: r.insightClass,
      aggregationLevel: r.aggregationLevel,
      territoryCode: r.territoryCode,
      confidence: r.confidence,
      sampleSize: r.sampleSize,
      sourceSeat: r.sourceSeat,
      published: r.published,
      createdAt: r.createdAt.toISOString(),
    }))
    return Response.json({ success: true, data } satisfies APIResponse<typeof data>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Insights query failed',
      },
      { status: 500 }
    )
  }
}
