import { audit } from '@/lib/audit'
import { scanCostAnomalies, type CostAnomalyScanResult } from '@/lib/cost-anomaly'
import { snapshotCustomerCosts } from '@/lib/customer-cost'
import type { APIResponse } from '@/types'
import { verifyCronBearer } from '@/lib/verify-bearer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ops/cost-anomaly
 * Snapshot costs then scan for 10× spikes vs prior CustomerCostSnapshot median.
 * Auth: Bearer $CRON_SECRET
 */
export async function POST(req: Request): Promise<Response> {
    if (!verifyCronBearer(req)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: '401', label: '✕ Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      days?: number
      multiplier?: number
      snapshot?: boolean
    }
    const snapCount =
      body.snapshot === false ? 0 : await snapshotCustomerCosts(body.days ?? 30)
    const scan = await scanCostAnomalies({
      multiplier: body.multiplier,
      raiseAlerts: true,
      actor: 'computer_agent',
    })
    await audit('computer_agent', 'ops.cost_anomaly', undefined, {
      snapCount,
      checked: scan.checked,
      anomalyCount: scan.anomalies.length,
      alertsRaised: scan.alertsRaised,
    })

    return Response.json({
      success: true,
      data: {
        snapshotted: snapCount,
        ...scan,
        label:
          scan.anomalies.length > 0
            ? `▲ ${scan.anomalies.length} cost anomalies · ${scan.alertsRaised} alerts`
            : '✓ No cost anomalies',
      },
    } satisfies APIResponse<
      CostAnomalyScanResult & { snapshotted: number; label: string }
    >)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'cost anomaly scan failed',
      },
      { status: 500 }
    )
  }
}
