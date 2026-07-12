/**
 * Aggregate AI / seat / work spend per clientKey for Fleet enterprise.
 * Heuristic until real token metering — no guest PII.
 */

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getClientMonthlySpend } from '@/lib/spend-cap'

export interface CustomerCostRow {
  clientKey: string
  label: string | null
  estimatedUsd: number
  tokenEstimate: number
  callCount: number
  workSpendUsd: number
  knightSeatHits: Record<string, number>
  shape: string
  labelStatus: string
  periodStart: string
  periodEnd: string
}

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

/** Rough $ per Knight message (heuristic until usage metering). */
const EST_USD_PER_KNIGHT_MSG = 0.04
const EST_TOKENS_PER_MSG = 800

export function formatCostUsd(n: number): string {
  return USD.format(n)
}

export async function aggregateCustomerCosts(input?: {
  days?: number
}): Promise<CustomerCostRow[]> {
  const days = input?.days ?? 30
  const periodEnd = new Date()
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const clients = await db.supportClient.findMany({
    select: { id: true, clientKey: true, label: true },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  const rows: CustomerCostRow[] = []

  for (const c of clients) {
    const knightMsgs = await db.helpMessage.findMany({
      where: {
        role: 'KNIGHT',
        createdAt: { gte: periodStart, lte: periodEnd },
        ticket: { clientKey: c.clientKey },
      },
      select: { seat: true },
    })

    const seatHits: Record<string, number> = {}
    for (const m of knightMsgs) {
      const seat = m.seat?.trim() || 'unknown'
      seatHits[seat] = (seatHits[seat] ?? 0) + 1
    }

    const callCount = knightMsgs.length
    const tokenEstimate = callCount * EST_TOKENS_PER_MSG
    const estimatedUsd = Math.round(callCount * EST_USD_PER_KNIGHT_MSG * 100) / 100
    const workSpendUsd = await getClientMonthlySpend(c.clientKey)

    const total = estimatedUsd + workSpendUsd
    let shape = '○'
    let labelStatus = 'Quiet'
    if (total >= 500) {
      shape = '■'
      labelStatus = 'High spend'
    } else if (total >= 50) {
      shape = '▲'
      labelStatus = 'Active'
    } else if (total > 0) {
      shape = '●'
      labelStatus = 'Low'
    }

    rows.push({
      clientKey: c.clientKey,
      label: c.label,
      estimatedUsd,
      tokenEstimate,
      callCount,
      workSpendUsd,
      knightSeatHits: seatHits,
      shape,
      labelStatus,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    })
  }

  return rows.sort(
    (a, b) => b.estimatedUsd + b.workSpendUsd - (a.estimatedUsd + a.workSpendUsd)
  )
}

/** Persist snapshot rows for historical charts (idempotent-ish per day). */
export async function snapshotCustomerCosts(days = 30): Promise<number> {
  const rows = await aggregateCustomerCosts({ days })
  const periodEnd = new Date()
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  let n = 0
  for (const r of rows) {
    const client = await db.supportClient.findUnique({
      where: { clientKey: r.clientKey },
      select: { id: true },
    })
    await db.customerCostSnapshot.create({
      data: {
        clientKey: r.clientKey,
        clientId: client?.id ?? null,
        periodStart,
        periodEnd,
        estimatedUsd: r.estimatedUsd,
        tokenEstimate: r.tokenEstimate,
        callCount: r.callCount,
        knightSeatHits: r.knightSeatHits as Prisma.InputJsonValue,
        workSpendUsd: r.workSpendUsd,
        source: 'aggregate',
      },
    })
    n++
  }
  return n
}
