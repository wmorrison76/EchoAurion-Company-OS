// ── Revenue Dashboard payloads (CLAUDE.md §14) ──────────────────────────────

export interface MRRPoint {
  date: string
  mrr: number
}

export interface SalaryTarget {
  target: number // $8,750/mo founder salary replacement
  current: number
  pct: number // 0..1
  remaining: number
}

export interface RaiseTracker {
  target: number
  committed: number
  conversations: number
  pct: number // 0..1
}

export interface CustomerPipeline {
  pilots: number
  paying: number
  churned: number
}

export interface RevenueRunway {
  totalCash: number
  monthlyBurn: number
  months: number | null
}

export interface RevenueOverview {
  mrr: number
  customerCount: number
  mrrConfigured: boolean
  mrrError: string | null
  history: MRRPoint[]
  salary: SalaryTarget
  raise: RaiseTracker
  pipeline: CustomerPipeline
  runway: RevenueRunway
  generatedAt: string
}
