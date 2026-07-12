/**
 * PII-free support & reliability aggregates for Dr. OS / Fleet.
 * No guest names, emails, or session PII — counts and fingerprints only.
 */

import { db } from '@/lib/db'
import { INTAKE_GATES, type IntakeGate } from '@/lib/intake-gate'

export interface SupportAnalyticsSnapshot {
  ticketsByGate: Array<{
    gate: IntakeGate | 'UNSET'
    count: number
    shape: string
    label: string
  }>
  errorFingerprintsTop: Array<{
    fingerprint: string
    hitCount: number
    distinctClients: number
    errorCategory: string
    productLine: string
    sampleMessage: string
  }>
  /** Mean hours from create → resolve for RESOLVED tickets (proxy MTTR). */
  mttrHoursProxy: number | null
  resolvedSampleSize: number
  ciDeployFailCounts: {
    openSystemInfra: number
    openSystemIntegration: number
    agentWorking: number
  }
  knightSeatDegraded: number
  knightSeatTotal: number
  canaryVsFleet: {
    canary: number
    fleet: number
    unset: number
  }
  deadLetterNotify: number
  byClientKey: Array<{
    clientKey: string
    openTickets: number
    productLine: string | null
  }>
  generatedAt: string
}

const GATE_SHAPE: Record<IntakeGate | 'UNSET', { shape: string; label: string }> = {
  TECH: { shape: '◆', label: 'Tech' },
  BILLING: { shape: '●', label: 'Billing' },
  BUILD: { shape: '■', label: 'Build' },
  OTHER: { shape: '○', label: 'Other' },
  UNSET: { shape: '?', label: 'Unset' },
}

export async function buildSupportAnalytics(): Promise<SupportAnalyticsSnapshot> {
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const [
    gateGroups,
    patterns,
    resolved,
    openInfra,
    openIntegration,
    agentWorking,
    canary,
    fleet,
    rolloutUnset,
    deadLetter,
    byClient,
  ] = await Promise.all([
    db.helpTicket.groupBy({
      by: ['intakeGate'],
      _count: { _all: true },
    }),
    db.errorPattern.findMany({
      orderBy: { hitCount: 'desc' },
      take: 10,
      select: {
        fingerprint: true,
        hitCount: true,
        distinctClients: true,
        errorCategory: true,
        productLine: true,
        sampleMessage: true,
      },
    }),
    db.helpTicket.findMany({
      where: {
        status: 'RESOLVED',
        resolvedAt: { not: null, gte: since90 },
      },
      select: { createdAt: true, resolvedAt: true },
      take: 500,
    }),
    db.helpTicket.count({
      where: {
        channel: 'SYSTEM',
        status: { in: ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] },
        errorCategory: 'INFRA',
      },
    }),
    db.helpTicket.count({
      where: {
        channel: 'SYSTEM',
        status: { in: ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] },
        errorCategory: 'INTEGRATION',
      },
    }),
    db.helpTicket.count({ where: { agentWorking: true } }),
    db.helpTicket.count({ where: { rolloutStage: 'canary' } }),
    db.helpTicket.count({ where: { rolloutStage: 'fleet' } }),
    db.helpTicket.count({
      where: {
        errorScope: 'GLOBAL',
        OR: [{ rolloutStage: null }, { rolloutStage: '' }],
        status: { in: ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL', 'RESOLVED'] },
      },
    }),
    db.ingestJob.count({
      where: { kind: 'notify_fanout', status: 'FAILED' },
    }),
    db.helpTicket.groupBy({
      by: ['clientKey', 'productLine'],
      where: {
        status: { in: ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] },
        clientKey: { not: null },
      },
      _count: { _all: true },
    }),
  ])

  const gateMap = new Map<string, number>()
  for (const g of gateGroups) {
    gateMap.set(g.intakeGate ?? 'UNSET', g._count._all)
  }
  const ticketsByGate = [...INTAKE_GATES, null].map((g) => {
    const key = (g ?? 'UNSET') as IntakeGate | 'UNSET'
    const meta = GATE_SHAPE[key]
    return {
      gate: key,
      count: gateMap.get(key) ?? 0,
      shape: meta.shape,
      label: meta.label,
    }
  })

  let mttrHoursProxy: number | null = null
  if (resolved.length > 0) {
    const hours = resolved
      .filter((r) => r.resolvedAt)
      .map(
        (r) =>
          (r.resolvedAt!.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60)
      )
    mttrHoursProxy =
      Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10
  }

  // Knight seats: count configured vs missing from env (same pattern as roster).
  const seatEnvKeys = [
    'PERPLEXITY_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_AI_API_KEY',
    'GEMINI_API_KEY',
    'ECHO_AI_URL',
  ]
  const knightSeatTotal = 6
  let configured = 0
  if (process.env.PERPLEXITY_API_KEY?.trim()) configured++
  if (process.env.OPENAI_API_KEY?.trim()) configured++
  if (process.env.ANTHROPIC_API_KEY?.trim()) configured += 2 // strategist + architect
  if (
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  ) {
    configured++
  }
  if (process.env.ECHO_AI_URL?.trim() && process.env.ECHO_AI_KEY?.trim()) configured++
  const knightSeatDegraded = Math.max(0, knightSeatTotal - Math.min(configured, knightSeatTotal))
  void seatEnvKeys

  const byClientKey = byClient
    .filter((r) => r.clientKey)
    .map((r) => ({
      clientKey: r.clientKey!,
      openTickets: r._count._all,
      productLine: r.productLine,
    }))
    .sort((a, b) => b.openTickets - a.openTickets)
    .slice(0, 25)

  return {
    ticketsByGate,
    errorFingerprintsTop: patterns.map((p) => ({
      fingerprint: p.fingerprint.slice(0, 16),
      hitCount: p.hitCount,
      distinctClients: p.distinctClients,
      errorCategory: p.errorCategory,
      productLine: p.productLine,
      sampleMessage: p.sampleMessage.slice(0, 120),
    })),
    mttrHoursProxy,
    resolvedSampleSize: resolved.length,
    ciDeployFailCounts: {
      openSystemInfra: openInfra,
      openSystemIntegration: openIntegration,
      agentWorking,
    },
    knightSeatDegraded,
    knightSeatTotal,
    canaryVsFleet: {
      canary,
      fleet,
      unset: rolloutUnset,
    },
    deadLetterNotify: deadLetter,
    byClientKey,
    generatedAt: new Date().toISOString(),
  }
}
