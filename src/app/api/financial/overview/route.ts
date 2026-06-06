import { auth } from '@/lib/auth'
import { getFinancialOverview } from '@/lib/financial'
import type { APIResponse } from '@/types'
import type { FinancialOverview } from '@/types/financial'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const data = await getFinancialOverview()
    const body: APIResponse<FinancialOverview> = {
      success: true,
      data,
      meta: { lastUpdated: data.generatedAt },
    }
    return Response.json(body)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Overview failed' },
      { status: 500 }
    )
  }
}
