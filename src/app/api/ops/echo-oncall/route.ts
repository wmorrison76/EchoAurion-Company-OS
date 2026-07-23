import { runEchoOncall, type EchoOncallResult } from '@/lib/echo-oncall'
import type { APIResponse } from '@/types'
import { verifyCronBearer } from '@/lib/verify-bearer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ops/echo-oncall
 * Email William when Echo TECH tickets remain unresolved past ECHO_ONCALL_MINUTES.
 * Auth: Bearer $CRON_SECRET
 * Env: ECHO_ONCALL_MINUTES (default 30), ECHO_ONCALL_TO / FIX_DIGEST_TO / ADMIN_EMAIL
 */
export async function POST(req: Request): Promise<Response> {
    if (!verifyCronBearer(req)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401', label: '✕ Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const data = await runEchoOncall()
    return Response.json({
      success: true,
      data,
    } satisfies APIResponse<EchoOncallResult>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Echo on-call failed',
      },
      { status: 500 }
    )
  }
}
