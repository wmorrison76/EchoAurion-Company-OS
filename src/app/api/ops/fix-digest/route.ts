import { runFixDigest, type FixDigestResult } from '@/lib/fix-digest'
import type { APIResponse } from '@/types'
import { verifyCronBearer } from '@/lib/verify-bearer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ops/fix-digest
 * Email William a summary of Help Desk / Echo / SYSTEM fixes since last window.
 * Auth: Bearer $CRON_SECRET
 * Env: FIX_DIGEST_HOURS (default 4), FIX_DIGEST_TO (falls back to ADMIN_EMAIL)
 * Skips send gracefully when email is not configured.
 */
export async function POST(req: Request): Promise<Response> {
    if (!verifyCronBearer(req)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401', label: '✕ Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const data = await runFixDigest()
    return Response.json({
      success: true,
      data,
    } satisfies APIResponse<FixDigestResult>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'fix digest failed',
      },
      { status: 500 }
    )
  }
}
