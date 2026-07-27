import { auth } from '@/lib/auth'
import { getFinancialOverview } from '@/lib/financial'
import type { APIResponse } from '@/types'
import type { RevenueRunway } from '@/types/revenue'

export const dynamic = 'force-dynamic'

// Runway = total cash / 90-day burn (CLAUDE.md §14.2), sourced from the
// Financial Monitor so both modules agree on a single figure.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const fin = await getFinancialOverview()
    const data: RevenueRunway = {
      totalCash: fin.runway.totalCash,
      monthlyBurn: fin.runway.monthlyBurn,
      months: fin.runway.months,
    }
    return Response.json({ success: true, data } satisfies APIResponse<RevenueRunway>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Runway failed' },
      { status: 500 }
    )
  }
}
