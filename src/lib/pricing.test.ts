import { describe, expect, it } from 'vitest'
import { COMPLEXITY_TIERS, TIERS, computeQuote, seniorRate, valueMultiplier } from './pricing'

describe('pricing', () => {
  it('defaults to $185/hr and 2.5× when env is unset', () => {
    delete process.env.WORK_SENIOR_RATE
    delete process.env.WORK_VALUE_MULTIPLIER
    expect(seniorRate()).toBe(185)
    expect(valueMultiplier()).toBe(2.5)
  })

  it('computes the canonical quote: rate × hours × 2.5 × tierMultiplier', () => {
    delete process.env.WORK_SENIOR_RATE
    delete process.env.WORK_VALUE_MULTIPLIER
    // T3 (×1.5), 5h → 185 × 5 × 2.5 × 1.5 = 3468.75 → ceil 3469, above the $2000 floor.
    const q = computeQuote('T3', 5)
    expect(q.raw).toBe(3469)
    expect(q.total).toBe(3469)
    expect(q.tierMultiplier).toBe(1.5)
  })

  it('never quotes below the tier floor', () => {
    // T5 (×2.0) at its minimum hours still can't undercut the $15,000 floor here.
    const q = computeQuote('T5', 1)
    expect(q.total).toBe(TIERS.T5.floor)
    expect(q.total).toBeGreaterThan(q.raw)
  })

  it('uses the tier default when hours are omitted or non-positive', () => {
    expect(computeQuote('T2').humanHours).toBe(TIERS.T2.defaultHours)
    expect(computeQuote('T2', 0).humanHours).toBe(TIERS.T2.defaultHours)
    expect(computeQuote('T2', -4).humanHours).toBe(TIERS.T2.defaultHours)
  })

  it('honors env overrides for rate and value multiplier', () => {
    process.env.WORK_SENIOR_RATE = '200'
    process.env.WORK_VALUE_MULTIPLIER = '3'
    // 200 × 10 × 3 × 1.75 = 10500 (T4), above the $6000 floor.
    expect(computeQuote('T4', 10).total).toBe(10500)
    delete process.env.WORK_SENIOR_RATE
    delete process.env.WORK_VALUE_MULTIPLIER
  })

  it('ignores invalid env values and falls back to defaults', () => {
    process.env.WORK_SENIOR_RATE = 'not-a-number'
    process.env.WORK_VALUE_MULTIPLIER = '-1'
    expect(seniorRate()).toBe(185)
    expect(valueMultiplier()).toBe(2.5)
    delete process.env.WORK_SENIOR_RATE
    delete process.env.WORK_VALUE_MULTIPLIER
  })

  it('escalates monotonically by tier at equal hours', () => {
    const totals = COMPLEXITY_TIERS.map((t) => computeQuote(t, 40).total)
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1])
    }
  })
})
