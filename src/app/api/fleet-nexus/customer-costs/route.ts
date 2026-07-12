import { auth } from '@/lib/auth'
import { aggregateCustomerCosts, formatCostUsd, snapshotCustomerCosts } from '@/lib/customer-cost'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/** GET /api/fleet-nexus/customer-costs — AI & seat cost by customer. */
export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const days = Number(new URL(req.url).searchParams.get('days') ?? '30')
    const rows = await aggregateCustomerCosts({
      days: Number.isFinite(days) ? Math.min(Math.max(days, 1), 90) : 30,
    })
    return Response.json({
      success: true,
      data: {
        rows: rows.map((r) => ({
          ...r,
          estimatedUsdLabel: formatCostUsd(r.estimatedUsd),
          workSpendUsdLabel: formatCostUsd(r.workSpendUsd),
          totalUsdLabel: formatCostUsd(r.estimatedUsd + r.workSpendUsd),
        })),
      },
      meta: { lastUpdated: new Date().toISOString() },
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Customer costs failed',
      },
      { status: 500 }
    )
  }
}

/** POST — persist CustomerCostSnapshot rows (operator / cron). */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { days?: number }
    const n = await snapshotCustomerCosts(body.days ?? 30)
    await audit('william_morrison', 'fleet.customer_cost.snapshot', undefined, { count: n })
    return Response.json({
      success: true,
      data: { snapshotted: n },
    } satisfies APIResponse<{ snapshotted: number }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Snapshot failed',
      },
      { status: 500 }
    )
  }
}
