import { auth } from '@/lib/auth'
import { aiUsageSummary } from '@/lib/ai-usage'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/fleet-nexus/ai-usage?days=30
 * Real AI spend rollup from AiUsageEvent (token metering, not the heuristic):
 * owner total, month-to-date vs budget, by provider/model, top tenants.
 * Auth: admin session.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  const url = new URL(req.url)
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 30) || 30, 1), 365)

  try {
    const data = await aiUsageSummary(days)
    return Response.json({
      success: true,
      data,
    } satisfies APIResponse<Awaited<ReturnType<typeof aiUsageSummary>>>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'AI usage summary failed',
      },
      { status: 500 }
    )
  }
}
