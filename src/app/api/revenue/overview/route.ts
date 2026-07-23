import { auth } from '@/lib/auth'
import { getRevenueOverview } from '@/lib/revenue'
import type { APIResponse } from '@/types'
import type { RevenueOverview } from '@/types/revenue'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const data = await getRevenueOverview()
    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: data.generatedAt },
    } satisfies APIResponse<RevenueOverview>, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
    })
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Overview failed' },
      { status: 500 }
    )
  }
}
