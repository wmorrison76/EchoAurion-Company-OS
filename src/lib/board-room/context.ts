import { db } from '@/lib/db'
import { getRevenueOverview } from '@/lib/revenue'
import { ROSTER } from './knights'
import { formatUSD } from '@/lib/utils'
import type { Seat } from '@/types/board-room'

export interface CompanySnapshot {
  mrr: number | null
  customerCount: number | null
  salaryPct: number | null
  raiseCommitted: number | null
  raiseTarget: number | null
  totalCash: number | null
  monthlyBurn: number | null
  runwayMonths: number | null
  pipeline: { stage: string; count: number }[]
  contactCount: number | null
  generatedAt: string
}

// Single live snapshot of the Company OS, reused by the context builder and the
// daily briefing (Phase 3 / Phase 4). Every field degrades to null offline.
export async function getCompanySnapshot(): Promise<CompanySnapshot> {
  const snap: CompanySnapshot = {
    mrr: null,
    customerCount: null,
    salaryPct: null,
    raiseCommitted: null,
    raiseTarget: null,
    totalCash: null,
    monthlyBurn: null,
    runwayMonths: null,
    pipeline: [],
    contactCount: null,
    generatedAt: new Date().toISOString(),
  }

  try {
    const rev = await getRevenueOverview()
    snap.mrr = rev.mrr
    snap.customerCount = rev.customerCount
    snap.salaryPct = rev.salary.pct
    snap.raiseCommitted = rev.raise.committed
    snap.raiseTarget = rev.raise.target
    snap.totalCash = rev.runway.totalCash
    snap.monthlyBurn = rev.runway.monthlyBurn
    snap.runwayMonths = rev.runway.months
  } catch {
    /* revenue/financial unavailable */
  }

  try {
    const grouped = await db.deal.groupBy({ by: ['stage'], _count: { stage: true } })
    snap.pipeline = grouped.map((g) => ({ stage: g.stage, count: g._count.stage }))
    snap.contactCount = await db.contact.count()
  } catch {
    /* CRM unavailable */
  }

  return snap
}

function num(v: number | null, fmt: (n: number) => string = (n) => String(n)): string {
  return v === null ? 'n/a' : fmt(v)
}

// Full live figures — only seats with DB access receive this (spec note #3).
function fullContext(snap: CompanySnapshot): string {
  const pipeline =
    snap.pipeline.length > 0
      ? snap.pipeline.map((p) => `${p.stage}: ${p.count}`).join(', ')
      : 'n/a'
  return [
    `MRR: ${num(snap.mrr, formatUSD)} (${num(snap.customerCount)} customers)`,
    `Founder-salary coverage: ${num(snap.salaryPct, (n) => `${Math.round(n * 100)}%`)}`,
    `Raise: ${num(snap.raiseCommitted, formatUSD)} / ${num(snap.raiseTarget, formatUSD)}`,
    `Cash: ${num(snap.totalCash, formatUSD)} · burn ${num(snap.monthlyBurn, formatUSD)}/mo · runway ${num(snap.runwayMonths, (n) => `${n.toFixed(1)} mo`)}`,
    `CRM: ${num(snap.contactCount)} contacts · pipeline [${pipeline}]`,
  ].join('\n')
}

// Permission layer (Phase 3): seats without DB access get a redacted, high-level
// summary — directional signals only, never raw figures or rows.
function redactedContext(snap: CompanySnapshot): string {
  const runway =
    snap.runwayMonths === null
      ? 'unknown'
      : snap.runwayMonths < 6
        ? 'under 6 months (tight)'
        : 'over 6 months'
  const salary =
    snap.salaryPct === null
      ? 'unknown'
      : snap.salaryPct >= 1
        ? 'covered'
        : 'below target'
  return [
    `Runway: ${runway}`,
    `Founder salary: ${salary}`,
    `Pipeline depth: ${snap.pipeline.reduce((s, p) => s + p.count, 0) || 'n/a'} open deals`,
    '(Raw financial figures are withheld from this seat.)',
  ].join('\n')
}

export async function buildKnightContext(seat: Seat, problem: string): Promise<string> {
  const snap = await getCompanySnapshot()
  const body = ROSTER[seat].hasDbAccess ? fullContext(snap) : redactedContext(snap)
  const access = ROSTER[seat].hasDbAccess
    ? 'You have live Company OS data below.'
    : 'You have a redacted summary below (no raw platform data).'
  return `Problem:\n${problem}\n\n${access}\n\nCompany context:\n${body}`
}
