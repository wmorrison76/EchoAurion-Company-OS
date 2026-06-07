import { auth } from '@/lib/auth'
import { ROSTER, knightConfigured } from '@/lib/board-room/knights'
import type { APIResponse } from '@/types'
import type { Seat } from '@/types/board-room'

export const dynamic = 'force-dynamic'

interface RosterSeat {
  seat: Seat
  name: string
  model: string
  role: string
  configured: boolean
  hasDbAccess: boolean
  conductor: boolean
}

// The roster with per-seat configured status (does its API key exist?). Never
// exposes key values — only whether each seat is active.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  const data: RosterSeat[] = (Object.keys(ROSTER) as Seat[]).map((seat) => {
    const k = ROSTER[seat]
    return {
      seat,
      name: k.name,
      model: k.model,
      role: k.role,
      configured: knightConfigured(k),
      hasDbAccess: k.hasDbAccess,
      conductor: Boolean(k.conductor),
    }
  })
  return Response.json({ success: true, data } satisfies APIResponse<RosterSeat[]>)
}
