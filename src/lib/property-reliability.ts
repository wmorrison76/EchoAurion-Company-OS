/**
 * Property reliability score — composite for Fleet Nexus (shape + label + number).
 * Inputs: open SYSTEM tickets, MTTR proxy, canary/fleet rollout, CSAT avg.
 * No guest PII.
 */

import { db } from '@/lib/db'

export interface PropertyReliabilityScore {
  clientKey: string
  /** 0–100 composite. */
  score: number
  shape: string
  label: string
  openSystem: number
  mttrHours: number | null
  csatAverage: number | null
  csatSampleSize: number
  canaryOpen: number
  fleetOpen: number
}

const OPEN = ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] as const

function band(score: number): { shape: string; label: string } {
  if (score >= 85) return { shape: '●', label: 'Strong' }
  if (score >= 70) return { shape: '○', label: 'Stable' }
  if (score >= 50) return { shape: '▲', label: 'Watch' }
  return { shape: '■', label: 'At risk' }
}

/**
 * Score one clientKey over a lookback window (default 90d for CSAT/MTTR).
 */
export async function computePropertyReliability(
  clientKey: string,
  opts?: { days?: number }
): Promise<PropertyReliabilityScore> {
  const days = opts?.days ?? 90
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [openSystem, openTickets, resolved, canaryOpen, fleetOpen] = await Promise.all([
    db.helpTicket.count({
      where: {
        clientKey,
        status: { in: [...OPEN] },
        errorScope: { in: ['GLOBAL', 'COHORT', 'ACCOUNT'] },
      },
    }),
    db.helpTicket.count({
      where: { clientKey, status: { in: [...OPEN] } },
    }),
    db.helpTicket.findMany({
      where: {
        clientKey,
        status: { in: ['RESOLVED', 'CLOSED'] },
        resolvedAt: { gte: since },
      },
      select: { createdAt: true, resolvedAt: true, csatScore: true },
      take: 200,
    }),
    db.helpTicket.count({
      where: { clientKey, status: { in: [...OPEN] }, rolloutStage: 'canary' },
    }),
    db.helpTicket.count({
      where: { clientKey, status: { in: [...OPEN] }, rolloutStage: 'fleet' },
    }),
  ])

  const mttrHours =
    resolved.length > 0
      ? resolved.reduce((acc, r) => {
          if (!r.resolvedAt) return acc
          return acc + (r.resolvedAt.getTime() - r.createdAt.getTime()) / 3_600_000
        }, 0) / resolved.length
      : null

  const csatScores = resolved
    .map((r) => r.csatScore)
    .filter((n): n is number => n != null && n >= 1 && n <= 5)
  const csatAverage =
    csatScores.length > 0
      ? Math.round((csatScores.reduce((a, b) => a + b, 0) / csatScores.length) * 10) / 10
      : null

  // Start at 100; subtract weighted penalties; add CSAT bonus.
  let score = 100
  score -= Math.min(40, openSystem * 8)
  score -= Math.min(20, Math.max(0, openTickets - openSystem) * 2)
  if (mttrHours != null) {
    if (mttrHours > 72) score -= 20
    else if (mttrHours > 24) score -= 10
    else if (mttrHours > 8) score -= 5
  }
  if (canaryOpen > 0) score -= Math.min(10, canaryOpen * 3)
  if (csatAverage != null) {
    // 5★ → +10, 1★ → −10
    score += Math.round((csatAverage - 3) * 5)
  } else {
    score -= 5 // unscored resolves unknown quality
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const { shape, label } = band(score)

  return {
    clientKey,
    score,
    shape,
    label,
    openSystem,
    mttrHours: mttrHours != null ? Math.round(mttrHours * 10) / 10 : null,
    csatAverage,
    csatSampleSize: csatScores.length,
    canaryOpen,
    fleetOpen,
  }
}

/** Batch for Fleet Nexus client nodes (cap 100). */
export async function computePropertyReliabilityMap(
  clientKeys: string[]
): Promise<Map<string, PropertyReliabilityScore>> {
  const map = new Map<string, PropertyReliabilityScore>()
  const unique = [...new Set(clientKeys.filter(Boolean))].slice(0, 100)
  // Sequential to avoid Neon connection storms on large fleets.
  for (const key of unique) {
    map.set(key, await computePropertyReliability(key))
  }
  return map
}
