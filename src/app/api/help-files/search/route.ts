import { auth } from '@/lib/auth'
import { searchHelpArticles } from '@/lib/help-files'
import type { APIResponse } from '@/types'
import type { HelpArticleView } from '@/types/help-files'

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const q = url.searchParams.get('q') ?? ''
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20) || 20, 50)
    const data = await searchHelpArticles(q, limit)
    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<HelpArticleView[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    )
  }
}
