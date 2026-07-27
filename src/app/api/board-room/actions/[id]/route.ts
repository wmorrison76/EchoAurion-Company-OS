import { z } from 'zod'
import { auth } from '@/lib/auth'
import { approveAction, dismissAction, executeAction } from '@/lib/board-room/actions'
import type { APIResponse } from '@/types'
import type { BoardActionDTO } from '@/types/board-room'

export const dynamic = 'force-dynamic'

const schema = z.object({ op: z.enum(['approve', 'execute', 'dismiss']) })

// Two-step gate (Phase 4): approve, then execute. Execute only PREPARES a draft
// and records it — it never sends email, books calendar, or opens tickets.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid op' }, { status: 400 })
    }
    let data: BoardActionDTO
    if (parsed.data.op === 'approve') data = await approveAction(params.id, 'william_morrison')
    else if (parsed.data.op === 'execute') data = await executeAction(params.id, 'william_morrison')
    else data = await dismissAction(params.id, 'william_morrison')

    return Response.json({ success: true, data } satisfies APIResponse<BoardActionDTO>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    )
  }
}
