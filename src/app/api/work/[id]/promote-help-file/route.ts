import { auth } from '@/lib/auth'
import { promoteWorkToHelpFile } from '@/lib/quote-help-file'
import type { APIResponse } from '@/types'
import type { HelpArticleView } from '@/types/help-files'

export const dynamic = 'force-dynamic'

/**
 * POST /api/work/[id]/promote-help-file
 * T3+ authorized/executed builds → tenant-scrubbed Help File draft.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const { id } = await ctx.params
    const result = await promoteWorkToHelpFile({
      workRequestId: id,
      actor: 'william_morrison',
    })
    if (!result.ok) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400
      return Response.json(
        { success: false, error: result.error, code: result.code },
        { status }
      )
    }
    return Response.json({
      success: true,
      data: { article: result.article, created: result.created },
    } satisfies APIResponse<{ article: HelpArticleView; created: boolean }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Promote failed',
      },
      { status: 500 }
    )
  }
}
