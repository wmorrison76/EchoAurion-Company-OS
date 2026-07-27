/**
 * PII-free support & reliability aggregates for Dr. OS / Fleet.
 * No guest names, emails, or session PII — counts and fingerprints only.
 */

import { db } from '@/lib/db'
import {
  INTAKE_GATES,
  INTAKE_CHANNELS,
  INTAKE_CHANNEL_META,
  type IntakeGate,
  type IntakeChannel,
} from '@/lib/intake-gate'

export interface SupportAnalyticsSnapshot {
  ticketsByGate: Array<{
    gate: IntakeGate | 'UNSET'
    count: number
    shape: string
    label: string
  }>
  ticketsByChannel: Array<{
    channel: IntakeChannel | 'UNSET'
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
  /** Mean CSAT 1–5 over resolved sample with scores (90d). */
  csatAverage: number | null
  csatSampleSize: number
  sla: {
    openBreached: number
    openAtRisk: number
    openOnTrack: number
  }
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
  stuckOutbox: number
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

const OPEN = ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] as const

export async function buildSupportAnalytics(): Promise<SupportAnalyticsSnapshot> {
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const now = new Date()
  const warnHorizon = new Date(now.getTime() + 30 * 60_000)
  const stuckCutoff = new Date(now.getTime() - 5 * 60_000)

  const [
    gateGroups,
    channelGroups,
    patterns,
    resolved,
    openInfra,
    openIntegration,
    agentWorking,
    canary,
    fleet,
    rolloutUnset,
    deadLetter,
    stuckOutbox,
    byClient,
    openBreached,
    openAtRisk,
    openOnTrack,
  ] = await Promise.all([
    db.helpTicket.groupBy({
      by: ['intakeGate'],
      _count: { _all: true },
    }),
    db.helpTicket.groupBy({
      by: ['intakeChannel'],
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
      select: { createdAt: true, resolvedAt: true, csatScore: true },
      take: 500,
    }),
    db.helpTicket.count({
      where: {
        channel: 'SYSTEM',
        status: { in: [...OPEN] },
        errorCategory: 'INFRA',
      },
    }),
    db.helpTicket.count({
      where: {
        channel: 'SYSTEM',
        status: { in: [...OPEN] },
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
        status: { in: [...OPEN, 'RESOLVED'] },
      },
    }),
    db.ingestJob.count({
      where: { kind: 'notify_fanout', status: 'FAILED' },
    }),
    db.relayOutbox.count({
      where: { deliveredAt: null, createdAt: { lt: stuckCutoff } },
    }),
    db.helpTicket.groupBy({
      by: ['clientKey', 'productLine'],
      where: {
        status: { in: [...OPEN] },
        clientKey: { not: null },
      },
      _count: { _all: true },
    }),
    db.helpTicket.count({
      where: {
        status: { in: [...OPEN] },
        OR: [
          { slaBreachedAt: { not: null } },
          { firstResponseAt: null, firstResponseDueAt: { lt: now } },
          { resolveDueAt: { lt: now } },
        ],
      },
    }),
    db.helpTicket.count({
      where: {
        status: { in: [...OPEN] },
        slaBreachedAt: null,
        OR: [
          {
            firstResponseAt: null,
            firstResponseDueAt: { gte: now, lte: warnHorizon },
          },
          { resolveDueAt: { gte: now, lte: warnHorizon } },
        ],
      },
    }),
    db.helpTicket.count({
      where: {
        status: { in: [...OPEN] },
        slaBreachedAt: null,
        AND: [
          {
            OR: [
              { firstResponseAt: { not: null } },
              { firstResponseDueAt: null },
              { firstResponseDueAt: { gt: warnHorizon } },
            ],
          },
          {
            OR: [{ resolveDueAt: null }, { resolveDueAt: { gt: warnHorizon } }],
          },
        ],
      },
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

  const channelMap = new Map<string, number>()
  for (const c of channelGroups) {
    channelMap.set(c.intakeChannel ?? 'UNSET', c._count._all)
  }
  const ticketsByChannel = [
    ...INTAKE_CHANNELS.map((ch) => {
      const meta = INTAKE_CHANNEL_META[ch]
      return {
        channel: ch as IntakeChannel | 'UNSET',
        count: channelMap.get(ch) ?? 0,
        shape: meta.shape,
        label: meta.label,
      }
    }),
  ]

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

  const csatScores = resolved
    .map((r) => r.csatScore)
    .filter((s): s is number => typeof s === 'number' && s >= 1 && s <= 5)
  const csatAverage =
    csatScores.length > 0
      ? Math.round((csatScores.reduce((a, b) => a + b, 0) / csatScores.length) * 10) / 10
      : null

  const knightSeatTotal = 6
  let configured = 0
  if (process.env.PERPLEXITY_API_KEY?.trim()) configured++
  if (process.env.OPENAI_API_KEY?.trim()) configured++
  if (process.env.ANTHROPIC_API_KEY?.trim()) configured += 2
  if (
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  ) {
    configured++
  }
  if (process.env.ECHO_AI_URL?.trim() && process.env.ECHO_AI_KEY?.trim()) configured++
  const knightSeatDegraded = Math.max(0, knightSeatTotal - Math.min(configured, knightSeatTotal))

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
    ticketsByChannel,
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
    csatAverage,
    csatSampleSize: csatScores.length,
    sla: {
      openBreached,
      openAtRisk,
      openOnTrack,
    },
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
    stuckOutbox,
    byClientKey,
    generatedAt: new Date().toISOString(),
  }
}
