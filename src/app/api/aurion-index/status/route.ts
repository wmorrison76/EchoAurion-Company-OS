import { auth } from '@/lib/auth'
import { MIGRATION_CHECKLIST, COST_TOTAL } from '@/lib/aurion-index'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

interface AurionStatus {
  deployed: boolean
  estimatedMonthlyCost: number
  checklist: { label: string; done: boolean }[]
}

// Pre-migration: the stack is not deployed (CLAUDE.md §11.4). Once deployed,
// a deploy record + CloudWatch metrics would populate this from the DB/AWS SDK.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  const data: AurionStatus = {
    deployed: false,
    estimatedMonthlyCost: COST_TOTAL,
    checklist: MIGRATION_CHECKLIST,
  }
  return Response.json({ success: true, data } satisfies APIResponse<AurionStatus>)
}
