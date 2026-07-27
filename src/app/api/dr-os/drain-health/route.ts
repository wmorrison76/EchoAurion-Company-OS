import { auth } from '@/lib/auth'
import { getDrainHealth } from '@/lib/dr-os-chips'
import type { APIResponse } from '@/types'
import type { DrainHealthSnapshot } from '@/types/drain-health'

export const dynamic = 'force-dynamic'

export type { DrainHealthSnapshot }

/**
 * GET /api/dr-os/drain-health
 * Compact dead-letter / ingest-drain health for Dr. OS chip.
 * Counts only — no job payloads / PII.
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const data = await getDrainHealth()
    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<DrainHealthSnapshot>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Drain health failed',
      },
      { status: 500 }
    )
  }
}
