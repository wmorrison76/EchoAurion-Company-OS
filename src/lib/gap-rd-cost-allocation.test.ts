import { describe, expect, it } from 'vitest'
import { allocateGapRDCosts } from './gap-rd-cost-allocation'

const usage = [
  { id: 'call1', provider: 'anthropic', model: 'sonnet', costUsd: 0.01, estimated: false },
  { id: 'call2', provider: 'openai', model: 'gpt', costUsd: 2.50, estimated: true },
]

describe('gap R&D allocation — draft only, never automatic GL posting', () => {
  it('splits cents without double counting and leaves unidentified spend unallocated', () => {
    const result = allocateGapRDCosts({
      usage,
      shares: [
        { usageId: 'call1', workRequestId: 'gap-b', basisPoints: 5000 },
        { usageId: 'call1', workRequestId: 'gap-a', basisPoints: 5000 },
        { usageId: 'call2', workRequestId: 'gap-a', basisPoints: 4000 },
      ],
    })
    expect(result.measuredTotalCents).toBe(251)
    expect(result.allocatedTotalCents).toBe(101)
    expect(result.unallocatedCents).toBe(150)
    expect(result.costsByGapCents['gap-a'] + result.costsByGapCents['gap-b']).toBe(101)
    expect(result.requiresVendorReconciliation).toBe(true)
    expect(result.glStatus).toBe('NEEDS_GL_ACCOUNT')
    expect(result.posted).toBe(false)
  })

  it('allows an explicitly chosen GL account as a draft, not a posted expense', () => {
    const result = allocateGapRDCosts({
      usage: [usage[0]],
      shares: [{ usageId: 'call1', workRequestId: 'gap-a', basisPoints: 10000 }],
      glAccount: 'RND-CONTROLLER-SELECTED',
    })
    expect(result.glStatus).toBe('DRAFT_REVIEW')
    expect(result.glAccount).toBe('RND-CONTROLLER-SELECTED')
    expect(result.posted).toBe(false)
  })

  it('rejects unmeasured calls, duplicate usage and excess allocations', () => {
    expect(() => allocateGapRDCosts({
      usage,
      shares: [{ usageId: 'not-metered', workRequestId: 'gap-a', basisPoints: 10000 }],
    })).toThrow('RD_SHARE_INVALID')
    expect(() => allocateGapRDCosts({ usage: [usage[0], usage[0]], shares: [] }))
      .toThrow('RD_USAGE_INVALID_OR_DUPLICATE')
    expect(() => allocateGapRDCosts({
      usage: [usage[0]],
      shares: [
        { usageId: 'call1', workRequestId: 'gap-a', basisPoints: 7500 },
        { usageId: 'call1', workRequestId: 'gap-b', basisPoints: 7500 },
      ],
    })).toThrow('RD_ALLOCATION_OVER_100_PERCENT')
  })

  it('never treats estimated provider pricing as reconciled billing evidence', () => {
    const result = allocateGapRDCosts({
      usage: [usage[1]],
      shares: [{ usageId: 'call2', workRequestId: 'gap-a', basisPoints: 10000 }],
    })
    expect(result.requiresVendorReconciliation).toBe(true)
    expect(result.posted).toBe(false)
  })
})
