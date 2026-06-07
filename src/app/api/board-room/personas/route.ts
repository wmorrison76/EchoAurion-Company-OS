import { auth } from '@/lib/auth'
import { PRESET_PERSONAS } from '@/lib/board-room/personas'
import type { APIResponse } from '@/types'
import type { Persona } from '@/types/board-room'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  return Response.json({ success: true, data: PRESET_PERSONAS } satisfies APIResponse<Persona[]>)
}
