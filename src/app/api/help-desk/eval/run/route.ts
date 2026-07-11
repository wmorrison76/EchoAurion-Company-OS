import { z } from 'zod'
import { auth } from '@/lib/auth'
import { runHelpEval, latestEvalRun, ensureEvalCasesSeeded, type EvalRunSummary } from '@/lib/help-eval'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  withDrafts: z.boolean().optional(),
})

/** GET /api/help-desk/eval/run — latest score. */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    await ensureEvalCasesSeeded()
    const data = await latestEvalRun()
    return Response.json({
      success: true,
      data,
    } satisfies APIResponse<EvalRunSummary | null>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Eval fetch failed',
      },
      { status: 500 }
    )
  }
}

/** POST /api/help-desk/eval/run — run classifier (+ optional drafts) sandbox suite. */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    const withDrafts = parsed.success ? parsed.data.withDrafts === true : false
    const data = await runHelpEval({ withDrafts, actor: 'william_morrison' })
    return Response.json({ success: true, data } satisfies APIResponse<EvalRunSummary>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Eval run failed',
      },
      { status: 500 }
    )
  }
}
