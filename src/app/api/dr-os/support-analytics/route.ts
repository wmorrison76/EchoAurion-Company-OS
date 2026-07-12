import { auth } from '@/lib/auth'
import { buildSupportAnalytics } from '@/lib/support-analytics'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * PII-free support & reliability aggregates for Dr. OS / Fleet.
 * GET /api/dr-os/support-analytics
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const data = await buildSupportAnalytics()
    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: data.generatedAt },
    } satisfies APIResponse<typeof data>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Support analytics failed',
      },
      { status: 500 }
    )
  }
}
