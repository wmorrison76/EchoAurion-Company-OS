import { auth } from '@/lib/auth'
import { executeRunbook } from '@/lib/knights-executor'
import type { APIResponse } from '@/types'

/**
 * POST /api/help-desk/knights-watch/execute
 *
 * Manually kicks a Knights-Watch runbook execution.
 * Body: { runbookId: string, ticketId: string, mode?: 'dry_run' | 'live' }
 * Defaults to dry_run.
 *
 * Only William can run live executions until we've observed 50+ successful
 * dry-runs. The executor itself enforces status=PROMOTED, denyIfCore=false,
 * evalScore >= 0.8, so this endpoint is a thin auth+forwarder.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  let body: { runbookId?: string; ticketId?: string; mode?: 'dry_run' | 'live' }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  if (!body.runbookId || !body.ticketId) {
    return Response.json(
      { success: false, error: 'runbookId and ticketId required' },
      { status: 400 }
    )
  }

  const mode = body.mode ?? 'dry_run'
  // Only william_morrison can execute live runbooks until the feature is proven.
  if (mode === 'live' && session.user.email !== 'luccca1976@gmail.com') {
    return Response.json(
      { success: false, error: 'live execution restricted to william_morrison' },
      { status: 403 }
    )
  }

  try {
    const result = await executeRunbook({
      runbookId: body.runbookId,
      ticketId: body.ticketId,
      mode,
    })
    return Response.json({ success: true, data: result } satisfies APIResponse<typeof result>)
  } catch (e) {
    return Response.json(
      { success: false, error: e instanceof Error ? e.message : 'execution failed' },
      { status: 500 }
    )
  }
}
