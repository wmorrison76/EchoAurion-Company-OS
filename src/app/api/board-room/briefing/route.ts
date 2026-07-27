import { auth } from '@/lib/auth'
import { generateBriefing, getLatestBriefing } from '@/lib/board-room/briefing'
import type { APIResponse } from '@/types'
import type { BriefingDTO } from '@/types/board-room'
import { verifyCronBearer } from '@/lib/verify-bearer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const data = await getLatestBriefing()
    return Response.json({ success: true, data } satisfies APIResponse<BriefingDTO | null>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Briefing read failed' },
      { status: 500 }
    )
  }
}

// Generates the daily briefing. Allowed via the cron secret (Render 7am job) or
// an authenticated operator.
export async function POST(req: Request): Promise<Response> {
  const authorized = verifyCronBearer(req)
  if (!authorized) {
    const session = await auth()
    if (!session?.user) {
      return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
    }
  }
  try {
    const data = await generateBriefing()
    return Response.json({ success: true, data } satisfies APIResponse<BriefingDTO>, { status: 201 })
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Briefing failed' },
      { status: 500 }
    )
  }
}
