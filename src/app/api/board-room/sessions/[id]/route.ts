import { auth } from '@/lib/auth'
import { getSession } from '@/lib/board-room/session'
import type { APIResponse } from '@/types'
import type { BoardRoomSessionDTO } from '@/types/board-room'

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
    const data = await getSession(params.id)
    if (!data) {
      return Response.json({ success: false, error: 'Session not found' }, { status: 404 })
    }
    return Response.json({ success: true, data } satisfies APIResponse<BoardRoomSessionDTO>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Fetch failed' },
      { status: 500 }
    )
  }
}
