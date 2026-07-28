import { auth } from '@/lib/auth'
import { buildMoleKnightsAudit } from '@/lib/mole-knights-audit'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ops/mole-knights-audit
 * Dr. OS: are moles filing morning-open reports, and which Knight drafts look unreal?
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const data = await buildMoleKnightsAudit()
    return Response.json({ success: true, data } satisfies APIResponse<typeof data>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'audit failed',
      },
      { status: 500 }
    )
  }
}
