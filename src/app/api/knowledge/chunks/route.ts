import { auth } from '@/lib/auth'
import { listLearningChunks } from '@/lib/echo-learning'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/knowledge/chunks
 * Dr. OS browse of Echo learning plane — redacted content only.
 * Query: ?limit=50&section=runbook
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const limitRaw = Number(url.searchParams.get('limit') ?? '50')
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50
    const section = url.searchParams.get('section') ?? undefined
    const chunks = await listLearningChunks({ limit, section })
    return Response.json({
      success: true,
      data: { chunks, count: chunks.length },
    } satisfies APIResponse<{ chunks: typeof chunks; count: number }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'chunks query failed',
      },
      { status: 500 }
    )
  }
}
