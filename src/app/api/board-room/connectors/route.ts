import { auth } from '@/lib/auth'
import { ROSTER, knightConfigured, configHint } from '@/lib/board-room/knights'
import type { APIResponse } from '@/types'
import type { ConnectorState, Seat } from '@/types/board-room'

export const dynamic = 'force-dynamic'

// Phase 3 — connector-state view. Reports whether each seat's key is present and
// its access scope. Never exposes key values.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  const data: ConnectorState[] = (Object.keys(ROSTER) as Seat[]).map((seat) => {
    const k = ROSTER[seat]
    return {
      seat,
      name: k.name,
      provider: k.provider,
      apiKeyEnv: k.apiKeyEnv,
      configured: knightConfigured(k),
      hint: configHint(k),
      hasDbAccess: k.hasDbAccess,
      conductor: Boolean(k.conductor),
    }
  })
  return Response.json({ success: true, data } satisfies APIResponse<ConnectorState[]>)
}
