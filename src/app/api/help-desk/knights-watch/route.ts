import { auth } from '@/lib/auth'
import { getKnightsWatchSnapshot } from '@/lib/knights-watch'
import type { APIResponse } from '@/types'
import type { KnightsWatchSnapshot } from '@/types/knights-watch'

export const dynamic = 'force-dynamic'

/**
 * GET /api/help-desk/knights-watch
 * Compact "Knights watching" status — seats, last convene, cron health.
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const data = await getKnightsWatchSnapshot()
    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<KnightsWatchSnapshot>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Knights watch failed',
      },
      { status: 500 }
    )
  }
}
