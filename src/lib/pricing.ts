// Billable change-request pricing (Ask-the-Board "build me a fix/add-on").
// Quote = SeniorRate × HumanHours × ValueMultiplier(2.5) × TierMultiplier,
// floored per tier. Pure + client-safe so the console can preview live.

export const COMPLEXITY_TIERS = ['T1', 'T2', 'T3', 'T4', 'T5'] as const
export type ComplexityTier = (typeof COMPLEXITY_TIERS)[number]

export interface TierConfig {
  tier: ComplexityTier
  label: string
  description: string
  multiplier: number
  defaultHours: number
  minHours: number
  maxHours: number
  floor: number
  /** T5 (and anything bespoke) can never auto-approve. */
  requiresManualReview: boolean
}

export const TIERS: Record<ComplexityTier, TierConfig> = {
  T1: {
    tier: 'T1',
    label: 'Trivial',
    description: 'Config change, copy edit, toggle a setting',
    multiplier: 1.0,
    defaultHours: 1,
    minHours: 0.25,
    maxHours: 1,
    floor: 500,
    requiresManualReview: false,
  },
  T2: {
    tier: 'T2',
    label: 'Minor',
    description: 'Small field, report tweak, simple UI addition',
    multiplier: 1.25,
    defaultHours: 2,
    minHours: 1,
    maxHours: 3,
    floor: 900,
    requiresManualReview: false,
  },
  T3: {
    tier: 'T3',
    label: 'Standard',
    description: 'A real add-on — new screen or feature',
    multiplier: 1.5,
    defaultHours: 5,
    minHours: 3,
    maxHours: 8,
    floor: 2000,
    requiresManualReview: false,
  },
  T4: {
    tier: 'T4',
    label: 'Complex',
    description: 'Data-model change or new integration',
    multiplier: 1.75,
    defaultHours: 12,
    minHours: 8,
    maxHours: 20,
    floor: 6000,
    requiresManualReview: true,
  },
  T5: {
    tier: 'T5',
    label: 'Major',
    description: 'Bespoke / architecturally significant — custom quote',
    multiplier: 2.0,
    defaultHours: 30,
    minHours: 20,
    maxHours: 80,
    floor: 15000,
    requiresManualReview: true,
  },
}

export function seniorRate(): number {
  const v = Number(process.env.WORK_SENIOR_RATE)
  return Number.isFinite(v) && v > 0 ? v : 185
}

export function valueMultiplier(): number {
  const v = Number(process.env.WORK_VALUE_MULTIPLIER)
  return Number.isFinite(v) && v > 0 ? v : 2.5
}

export interface Quote {
  tier: ComplexityTier
  rate: number
  humanHours: number
  valueMultiplier: number
  tierMultiplier: number
  raw: number // before floor
  floor: number
  total: number // billed amount (USD)
}

/** Computes (and is the single source of truth for) a quote. */
export function computeQuote(tier: ComplexityTier, humanHours?: number): Quote {
  const cfg = TIERS[tier]
  const hours = humanHours && humanHours > 0 ? humanHours : cfg.defaultHours
  const rate = seniorRate()
  const vm = valueMultiplier()
  const raw = Math.ceil(rate * hours * vm * cfg.multiplier)
  return {
    tier,
    rate,
    humanHours: hours,
    valueMultiplier: vm,
    tierMultiplier: cfg.multiplier,
    raw,
    floor: cfg.floor,
    total: Math.max(cfg.floor, raw),
  }
}

export function formatUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
