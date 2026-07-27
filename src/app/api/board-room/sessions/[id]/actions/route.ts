import { auth } from '@/lib/auth'
import { listActions, proposeActions } from '@/lib/board-room/actions'
import type { APIResponse } from '@/types'
import type { BoardActionDTO } from '@/types/board-room'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const data = await listActions(params.id)
    return Response.json({ success: true, data } satisfies APIResponse<BoardActionDTO[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'List failed' },
      { status: 500 }
    )
  }
}

// Generate proposed (draft) actions from the session synthesis.
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const data = await proposeActions(params.id, 'william_morrison')
    return Response.json({ success: true, data } satisfies APIResponse<BoardActionDTO[]>, {
      status: 201,
    })
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Propose failed' },
      { status: 500 }
    )
  }
}
