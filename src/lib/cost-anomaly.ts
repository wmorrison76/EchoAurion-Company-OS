/**
 * Cost anomaly alerts — simple threshold vs prior CustomerCostSnapshot.
 * Default: current estimatedUsd ≥ 10× median of last N snapshots (or absolute floor).
 * Raises Alert rows (kind: system). No guest PII.
 */

import { db } from '@/lib/db'
import { raiseAlert } from '@/lib/alerts'
import { aggregateCustomerCosts, formatCostUsd } from '@/lib/customer-cost'
import { audit } from '@/lib/audit'

export interface CostAnomalyHit {
  clientKey: string
  currentUsd: number
  baselineUsd: number
  ratio: number
  shape: string
  label: string
}

export interface CostAnomalyScanResult {
  checked: number
  anomalies: CostAnomalyHit[]
  alertsRaised: number
}

const DEFAULT_MULTIPLIER = 10
const MIN_BASELINE_USD = 1
const MIN_CURRENT_USD = 5

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!
}

/**
 * Compare live aggregates to recent snapshots; raise alerts for 10× spikes.
 */
export async function scanCostAnomalies(opts?: {
  multiplier?: number
  snapshotLookback?: number
  raiseAlerts?: boolean
  actor?: 'william_morrison' | 'computer_agent'
}): Promise<CostAnomalyScanResult> {
  const multiplier = opts?.multiplier ?? DEFAULT_MULTIPLIER
  const lookback = opts?.snapshotLookback ?? 8
  const raise = opts?.raiseAlerts !== false
  const actor = opts?.actor ?? 'computer_agent'

  const live = await aggregateCustomerCosts({ days: 30 })
  const anomalies: CostAnomalyHit[] = []
  let alertsRaised = 0

  for (const row of live) {
    const currentUsd = row.estimatedUsd + row.workSpendUsd
    if (currentUsd < MIN_CURRENT_USD) continue

    const snaps = await db.customerCostSnapshot.findMany({
      where: { clientKey: row.clientKey },
      orderBy: { createdAt: 'desc' },
      take: lookback,
      select: { estimatedUsd: true, workSpendUsd: true },
    })

    // Need at least 2 prior snapshots to establish a baseline (exclude "first ever").
    if (snaps.length < 2) continue

    const totals = snaps.map((s) => (s.estimatedUsd ?? 0) + (s.workSpendUsd ?? 0))
    const baselineUsd = median(totals)
    if (baselineUsd < MIN_BASELINE_USD) continue

    const ratio = currentUsd / baselineUsd
    if (ratio < multiplier) continue

    const hit: CostAnomalyHit = {
      clientKey: row.clientKey,
      currentUsd: Math.round(currentUsd * 100) / 100,
      baselineUsd: Math.round(baselineUsd * 100) / 100,
      ratio: Math.round(ratio * 10) / 10,
      shape: '▲',
      label: 'Cost anomaly',
    }
    anomalies.push(hit)

    if (raise) {
      // Dedup: skip if same clientKey alerted in last 24h.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const recent = await db.alert.findFirst({
        where: {
          kind: 'system',
          entityRef: `cost:${row.clientKey}`,
          createdAt: { gte: since },
        },
      })
      if (!recent) {
        await raiseAlert({
          kind: 'system',
          severity: 'WARN',
          title: `▲ Cost anomaly · ${row.clientKey.slice(0, 24)}`,
          body: `${formatCostUsd(hit.currentUsd)} vs baseline ${formatCostUsd(hit.baselineUsd)} (${hit.ratio}×). Check Fleet Nexus cost table.`,
          entityRef: `cost:${row.clientKey}`,
          url: '/fleet-nexus',
        })
        alertsRaised++
      }
    }
  }

  await audit(actor, 'fleet.cost_anomaly.scan', undefined, {
    checked: live.length,
    anomalyCount: anomalies.length,
    alertsRaised,
    multiplier,
  }).catch(() => {})

  return { checked: live.length, anomalies, alertsRaised }
}
