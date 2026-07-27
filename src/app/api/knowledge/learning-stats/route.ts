import { auth } from '@/lib/auth'
import { learningPlaneStats } from '@/lib/echo-learning'
import { ingestQueueStats } from '@/lib/ingest-queue'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/knowledge/learning-stats
 * Dr. OS / Knowledge Plane: chunk counts + PII scrub status (shape+label).
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const [learning, queue] = await Promise.all([learningPlaneStats(), ingestQueueStats()])
    return Response.json({
      success: true,
      data: {
        ...learning,
        queue,
        label: learning.piiScrubActive
          ? '✓ PII scrub active'
          : '✕ PII scrub inactive',
        embeddingsLabel: learning.embeddingsEnabled
          ? '✓ Embeddings enabled'
          : '○ Embeddings deferred (keyword retrieve)',
      },
    } satisfies APIResponse<{
      chunks: number
      bySection: { section: string; count: number }[]
      lastIngestAt: string | null
      lastSignalAt: string | null
      piiScrubActive: true
      embeddingsEnabled: false
      queue: { pending: number; running: number; failed: number }
      label: string
      embeddingsLabel: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'stats failed',
      },
      { status: 500 }
    )
  }
}
