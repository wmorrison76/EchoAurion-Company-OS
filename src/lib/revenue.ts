import { db } from '@/lib/db'
import { calculateMRR, getChurnedCount, getStripe } from '@/lib/stripe'
import { getFinancialOverview } from '@/lib/financial'
import type {
  CustomerPipeline,
  MRRPoint,
  RaiseTracker,
  RevenueOverview,
  SalaryTarget,
} from '@/types/revenue'

// Founder salary replacement target (CLAUDE.md §14.3).
const SALARY_TARGET = 8750

async function getHistory(): Promise<MRRPoint[]> {
  try {
    const snaps = await db.mRRSnapshot.findMany({ orderBy: { snappedAt: 'asc' }, take: 180 })
    return snaps.map((s) => ({ date: s.snappedAt.toISOString(), mrr: s.mrr }))
  } catch {
    return []
  }
}

async function getRaise(): Promise<RaiseTracker> {
  try {
    let cfg = await db.raiseConfig.findFirst()
    if (!cfg) cfg = await db.raiseConfig.create({ data: {} })
    return {
      target: cfg.target,
      committed: cfg.committed,
      conversations: cfg.conversations,
      pct: cfg.target > 0 ? cfg.committed / cfg.target : 0,
    }
  } catch {
    return { target: 500_000, committed: 0, conversations: 0, pct: 0 }
  }
}

async function getPipeline(payingFallback: number): Promise<CustomerPipeline> {
  let pilots = 0
  try {
    pilots = await db.deal.count({ where: { stage: 'ACTIVE' } })
  } catch {
    pilots = 0
  }
  let churned = 0
  try {
    churned = await getChurnedCount(90)
  } catch {
    churned = 0
  }
  return { pilots, paying: payingFallback, churned }
}

export async function getRevenueOverview(): Promise<RevenueOverview> {
  let mrr = 0
  let customerCount = 0
  let mrrError: string | null = null
  const mrrConfigured = Boolean(getStripe())

  try {
    const res = await calculateMRR()
    mrr = res.mrr
    customerCount = res.customerCount
  } catch (error) {
    mrrError = error instanceof Error ? error.message : 'Stripe unavailable'
  }

  const [history, raise, pipeline, financial] = await Promise.all([
    getHistory(),
    getRaise(),
    getPipeline(customerCount),
    getFinancialOverview(),
  ])

  const salary: SalaryTarget = {
    target: SALARY_TARGET,
    current: mrr,
    pct: SALARY_TARGET > 0 ? Math.min(1, mrr / SALARY_TARGET) : 0,
    remaining: Math.max(0, SALARY_TARGET - mrr),
  }

  return {
    mrr,
    customerCount,
    mrrConfigured,
    mrrError,
    history,
    salary,
    raise,
    pipeline,
    runway: {
      totalCash: financial.runway.totalCash,
      monthlyBurn: financial.runway.monthlyBurn,
      months: financial.runway.months,
    },
    generatedAt: new Date().toISOString(),
  }
}
