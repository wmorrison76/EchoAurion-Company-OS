/**
 * CLAUDE.md §12.3 — Apple Wallet / Cash App / Zelle rent split-pay.
 * Flag $1,300–$1,600 transfers; monthly total lives on the bill calendar.
 */

const RENT_MIN = 1_300
const RENT_MAX = 1_600

const MARKERS = ['apple pay', 'apple wallet', 'cash app', 'zelle'] as const

export function isRentSplitPay(input: {
  name: string
  merchantName?: string | null
  amount: number
}): boolean {
  const abs = Math.abs(input.amount)
  if (abs < RENT_MIN || abs > RENT_MAX) return false
  const hay = `${input.name} ${input.merchantName ?? ''}`.toLowerCase()
  return MARKERS.some((m) => hay.includes(m))
}

export function rentSplitMonthlyTotal(
  txns: { name: string; merchantName?: string | null; amount: number; date: Date | string }[],
  now: Date = new Date()
): number {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  return txns
    .filter((t) => {
      const d = typeof t.date === 'string' ? new Date(t.date) : t.date
      return d.getUTCFullYear() === y && d.getUTCMonth() === m && isRentSplitPay(t)
    })
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
}
