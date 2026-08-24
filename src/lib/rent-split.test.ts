import { describe, expect, it } from 'vitest'
import { isRentSplitPay, rentSplitMonthlyTotal } from '@/lib/rent-split'

describe('isRentSplitPay', () => {
  it('flags Apple Pay / Cash App / Zelle in the $1,300–$1,600 band', () => {
    expect(isRentSplitPay({ name: 'Apple Pay Cash', amount: 1450 })).toBe(true)
    expect(isRentSplitPay({ name: 'Transfer', merchantName: 'Zelle', amount: 1300 })).toBe(true)
    expect(isRentSplitPay({ name: 'Cash App', amount: 1600 })).toBe(true)
    expect(isRentSplitPay({ name: 'Apple Wallet rent', amount: -1450 })).toBe(true)
  })

  it('ignores the same names outside the band and other merchants inside it', () => {
    expect(isRentSplitPay({ name: 'Apple Pay Cash', amount: 1299 })).toBe(false)
    expect(isRentSplitPay({ name: 'Apple Pay Cash', amount: 1601 })).toBe(false)
    expect(isRentSplitPay({ name: 'Whole Foods', amount: 1450 })).toBe(false)
  })
})

describe('rentSplitMonthlyTotal', () => {
  it('sums only current-UTC-month flagged transfers', () => {
    const now = new Date('2026-08-15T12:00:00.000Z')
    const total = rentSplitMonthlyTotal(
      [
        { name: 'Apple Pay', amount: 1450, date: '2026-08-03T00:00:00.000Z' },
        { name: 'Zelle', amount: 1500, date: '2026-07-20T00:00:00.000Z' },
        { name: 'Netflix', amount: 22, date: '2026-08-01T00:00:00.000Z' },
      ],
      now
    )
    expect(total).toBe(1450)
  })
})
