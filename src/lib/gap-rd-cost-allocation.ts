/**
 * Internal R&D job-cost allocation from measured AiUsageEvent rows.
 * Draft-only: this module neither changes AiUsageEvent nor posts a GL entry.
 * The controller chooses the R&D expense/capitalization account separately.
 */
export interface MeteredUsage {
  id: string
  provider: string
  model: string
  costUsd: number
  estimated: boolean
}

export interface GapUsageShare {
  usageId: string
  workRequestId: string
  /** Share of this AI call's expense allocated to this gap; 0..10000. */
  basisPoints: number
}

export interface RDAllocation {
  usageId: string
  workRequestId: string
  provider: string
  model: string
  amountCents: number
  estimated: boolean
}

export interface RDAllocationDraft {
  allocationLines: RDAllocation[]
  costsByGapCents: Record<string, number>
  measuredTotalCents: number
  allocatedTotalCents: number
  unallocatedCents: number
  requiresVendorReconciliation: boolean
  glAccount: string | null
  glStatus: 'NEEDS_GL_ACCOUNT' | 'DRAFT_REVIEW'
  posted: false
}

export function allocateGapRDCosts(input: {
  usage: readonly MeteredUsage[]
  shares: readonly GapUsageShare[]
  glAccount?: string | null
}): RDAllocationDraft {
  const usage = new Map<string, MeteredUsage>()
  let measuredTotalCents = 0
  for (const event of input.usage) {
    if (!event || !event.id || usage.has(event.id) ||
      !Number.isFinite(event.costUsd) || event.costUsd < 0 ||
      event.costUsd > 1_000_000 || !event.provider || !event.model) {
      throw new Error('RD_USAGE_INVALID_OR_DUPLICATE')
    }
    usage.set(event.id, event)
    measuredTotalCents += Math.round(event.costUsd * 100)
  }

  const allocations = new Map<string, GapUsageShare[]>()
  const seen = new Set<string>()
  for (const share of input.shares) {
    if (!share || !usage.has(share.usageId) ||
      !share.workRequestId || !Number.isSafeInteger(share.basisPoints) ||
      share.basisPoints <= 0 || share.basisPoints > 10000) {
      throw new Error('RD_SHARE_INVALID')
    }
    const key = JSON.stringify([share.usageId, share.workRequestId])
    if (seen.has(key)) throw new Error('RD_SHARE_DUPLICATE')
    seen.add(key)
    const rows = allocations.get(share.usageId) ?? []
    rows.push(share)
    allocations.set(share.usageId, rows)
  }

  const allocationLines: RDAllocation[] = []
  const costsByGapCents: Record<string, number> = Object.create(null) as Record<string, number>
  let allocatedTotalCents = 0
  // Metered provider cost is not an invoice. All allocated charges require
  // vendor-bill reconciliation before controller-approved GL posting.
  const requiresVendorReconciliation = input.shares.length > 0
  for (const [id, event] of usage) {
    const rows = (allocations.get(id) ?? []).sort((a, b) =>
      a.workRequestId.localeCompare(b.workRequestId))
    const totalBp = rows.reduce((sum, row) => sum + row.basisPoints, 0)
    if (totalBp > 10000) throw new Error('RD_ALLOCATION_OVER_100_PERCENT')
    const cents = Math.round(event.costUsd * 100)
    let cumulativeBp = 0
    for (const row of rows) {
      const prev = Math.round(cents * cumulativeBp / 10000)
      cumulativeBp += row.basisPoints
      const next = Math.round(cents * cumulativeBp / 10000)
      const allocatedCents = next - prev
      allocationLines.push({
        usageId: id, workRequestId: row.workRequestId,
        provider: event.provider, model: event.model,
        amountCents: allocatedCents, estimated: event.estimated,
      })
      costsByGapCents[row.workRequestId] = (costsByGapCents[row.workRequestId] ?? 0) + allocatedCents
      allocatedTotalCents += allocatedCents
    }
  }
  const glAccount = input.glAccount?.trim() || null
  return {
    allocationLines,
    costsByGapCents,
    measuredTotalCents,
    allocatedTotalCents,
    unallocatedCents: measuredTotalCents - allocatedTotalCents,
    requiresVendorReconciliation,
    glAccount,
    glStatus: glAccount ? 'DRAFT_REVIEW' : 'NEEDS_GL_ACCOUNT',
    posted: false,
  }
}
