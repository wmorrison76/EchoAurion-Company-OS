import { audit } from '@/lib/audit'
import { runHelpEval, ensureEvalCasesSeeded, type EvalRunSummary } from '@/lib/help-eval'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/ops/help-eval-friday
 * Standby simulation night — run HelpEval classifier suite before Friday rush.
 * Auth: Bearer $CRON_SECRET
 *
 * Suggested Render cron: `0 22 * * 4` (Thu 22:00 UTC ≈ Thu evening ET).
 * See docs/HELP_EVAL.md § Friday simulation nights.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization')
  if (!secret || authz !== `Bearer ${secret}`) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401', label: '✕ Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { withDrafts?: boolean }
    const withDrafts = body.withDrafts === true
    await ensureEvalCasesSeeded()
    const data = await runHelpEval({ withDrafts, actor: 'computer_agent' })
    await audit('computer_agent', 'ops.help_eval_friday', data.runId, {
      score: data.score,
      passed: data.passed,
      total: data.total,
      withDrafts,
      fridaySimulation: true,
    })

    const label =
      data.score >= 90
        ? `✓ Friday sim · ${data.score}% (${data.passed}/${data.total})`
        : data.score >= 70
          ? `⚠ Friday sim · ${data.score}% — review failures`
          : `✕ Friday sim · ${data.score}% — gate regressions`

    return Response.json({
      success: true,
      data: { ...data, label, fridaySimulation: true },
    } satisfies APIResponse<EvalRunSummary & { label: string; fridaySimulation: true }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Friday HelpEval failed',
      },
      { status: 500 }
    )
  }
}

export async function GET(): Promise<Response> {
  return Response.json({
    success: true,
    data: {
      endpoint: '/api/ops/help-eval-friday',
      auth: 'Bearer CRON_SECRET',
      scheduleHint: '0 22 * * 4  # Thu 22:00 UTC before Friday rush',
      docs: 'docs/HELP_EVAL.md',
    },
  })
}
