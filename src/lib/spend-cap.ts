/**
 * Per-client monthly build spend cap.
 * Env: BUILD_SPEND_CAP_USD (default 5000).
 */

import { db } from '@/lib/db'
import { formatUSD } from '@/lib/pricing'
import { buildSpendCapUsd } from '@/lib/spend-cap-config'

export { buildSpendCapUsd } from '@/lib/spend-cap-config'

export interface SpendCapStatus {
  clientKey: string
  capUsd: number
  spentUsd: number
  remainingUsd: number
  periodStart: string
  warn: boolean
  blocked: boolean
  message: string
}

function monthStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0))
}

/** Sum of quote totals for authorized/executed work this calendar month (UTC). */
export async function getClientMonthlySpend(clientKey: string): Promise<number> {
  const since = monthStart()
  const rows = await db.workRequest.findMany({
    where: {
      clientKey,
      quoteTotal: { not: null },
      OR: [
        { status: { in: ['AUTHORIZED', 'IN_PROGRESS', 'EXECUTED'] } },
        { approvedByCustomer: true },
      ],
      createdAt: { gte: since },
    },
    select: { quoteTotal: true },
  })
  return rows.reduce((sum, r) => sum + (r.quoteTotal ?? 0), 0)
}

export async function evaluateSpendCap(
  clientKey: string,
  proposedQuoteUsd: number
): Promise<SpendCapStatus> {
  const capUsd = buildSpendCapUsd()
  const spentUsd = await getClientMonthlySpend(clientKey)
  const remainingUsd = Math.max(0, capUsd - spentUsd)
  const blocked = proposedQuoteUsd > remainingUsd
  const warn = !blocked && proposedQuoteUsd > remainingUsd * 0.5
  const periodStart = monthStart().toISOString()
  let message: string
  if (blocked) {
    message = `Spend cap blocked: proposed ${formatUSD(proposedQuoteUsd)} exceeds remaining ${formatUSD(remainingUsd)} of ${formatUSD(capUsd)} monthly cap for ${clientKey}.`
  } else if (warn) {
    message = `Spend warning: ${formatUSD(proposedQuoteUsd)} uses >50% of remaining ${formatUSD(remainingUsd)} (cap ${formatUSD(capUsd)}).`
  } else {
    message = `Within cap: ${formatUSD(spentUsd)} spent, ${formatUSD(remainingUsd)} remaining of ${formatUSD(capUsd)}.`
  }
  return {
    clientKey,
    capUsd,
    spentUsd,
    remainingUsd,
    periodStart,
    warn,
    blocked,
    message,
  }
}
