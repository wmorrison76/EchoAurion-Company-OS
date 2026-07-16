import { auth } from '@/lib/auth'
import { backfillLearningPlane } from '@/lib/echo-learning'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/knowledge/backfill
 * One-shot seed of EchoKnowledgeChunk + knowledge_meta signals from existing
 * PROMOTED runbooks, GLOBAL/COHORT ErrorPatterns, and ops/public Help Files.
 * Auth: admin session OR Bearer $CRON_SECRET
 */
export async function POST(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization')
  const cronOk = Boolean(cronSecret && authz === `Bearer ${cronSecret}`)

  if (!cronOk) {
    const session = await auth()
    if (!session?.user) {
      return Response.json(
        { success: false, error: 'Unauthorized', code: '401', label: '✕ Unauthorized' },
        { status: 401 }
      )
    }
  }

  try {
    let limit = 200
    try {
      const body = (await req.json()) as { limit?: number }
      if (typeof body.limit === 'number' && body.limit > 0) {
        limit = Math.min(body.limit, 500)
      }
    } catch {
      // empty body is fine
    }

    const result = await backfillLearningPlane({ limit })

    return Response.json({
      success: true,
      data: {
        ...result,
        label:
          result.chunksAfter > 0
            ? `✓ Backfill complete · ${result.chunksAfter} chunks · ${result.signalsAfter} signals`
            : '⚠ Backfill ran · 0 chunks (no PROMOTED runbooks / ops help / GLOBAL patterns yet)',
      },
    } satisfies APIResponse<{
      runbooks: { ok: number; skipped: number }
      patterns: { ok: number; skipped: number }
      help: { ok: number; skipped: number }
      chunksAfter: number
      signalsAfter: number
      label: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'backfill failed',
        label: '✕ Backfill failed',
      },
      { status: 500 }
    )
  }
}
