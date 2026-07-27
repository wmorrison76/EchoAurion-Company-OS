import { relayAuthorized } from '@/lib/relay-auth'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/relay/whoami — pilot health / secret check.
 * Validates SUPPORT_INGEST_SECRET and returns ok + server time.
 */
export async function GET(req: Request): Promise<Response> {
  const a = relayAuthorized(req)
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }
  const now = new Date()
  return Response.json({
    success: true,
    data: {
      ok: true,
      service: 'echoaurion-company-os',
      relay: 'ready',
      serverTime: now.toISOString(),
      unixMs: now.getTime(),
    },
  } satisfies APIResponse<{
    ok: true
    service: string
    relay: string
    serverTime: string
    unixMs: number
  }>)
}
