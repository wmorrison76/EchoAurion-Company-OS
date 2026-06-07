import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { draftPlan } from '@/lib/support-relay'
import type { WorkKind } from '@/types/work'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

// Board Room drafts a sandbox-only implementation plan for review. It never
// applies anything — it produces the plan William quotes and approves against.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const { id } = await params
    const work = await db.workRequest.findUnique({ where: { id } })
    if (!work) return Response.json({ success: false, error: 'Not found' }, { status: 404 })

    const result = await draftPlan(work.title, work.detail, work.kind as WorkKind)
    if (!result.answer) {
      return Response.json(
        { success: false, error: result.error ?? 'Draft unavailable' },
        { status: 502 }
      )
    }
    await db.workRequest.update({
      where: { id },
      data: { draftPlan: result.answer, draftSeat: result.seat },
    })
    await audit('william_morrison', 'work.request.draft', id, { seat: result.seat })
    return Response.json(
      { success: true, data: { draftPlan: result.answer, seat: result.seat } } satisfies APIResponse<{
        draftPlan: string
        seat: string | null
      }>
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Draft failed' },
      { status: 500 }
    )
  }
}
