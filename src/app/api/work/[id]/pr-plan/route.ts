import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { createDraftPrPlan, maybeCreateGithubDraftPr, type PrPlan } from '@/lib/pr-from-build'
import { recordTimelineEvent } from '@/lib/help-timeline'
import type { APIResponse } from '@/types'
import type { GithubDraftPrResult } from '@/lib/pr-from-build'

export const dynamic = 'force-dynamic'

/**
 * POST /api/work/[id]/pr-plan — Architect PR-only pipeline.
 * Stores draft plan JSON on WorkRequest; optional GitHub draft PR (never merge).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const { id } = await params
    const work = await db.workRequest.findUnique({ where: { id } })
    if (!work) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const plan = await createDraftPrPlan(id)
    const github = await maybeCreateGithubDraftPr(id, plan)

    const ticket = await db.helpTicket.findFirst({ where: { workRequestId: id } })
    if (ticket) {
      await recordTimelineEvent({
        ticketId: ticket.id,
        kind: 'drafting',
        label: 'PR plan drafted',
        detail: `${plan.branchName} · ${github.created ? `draft PR #${github.number}` : 'plan only'}`,
      }).catch(() => {})
    }

    return Response.json({
      success: true,
      data: { plan, github },
    } satisfies APIResponse<{ plan: PrPlan; github: GithubDraftPrResult }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'PR plan failed',
      },
      { status: 500 }
    )
  }
}
