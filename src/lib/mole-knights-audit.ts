/**
 * Mole + Knights audit — are night cleaners reporting, and which Knight
 * runbooks look like unconfirmed / mismatched (hallucination risk)?
 */

import { db } from '@/lib/db'
import { getNightCleanerChip } from '@/lib/dr-os-chips'

const OPEN = ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] as const

export type MoleKnightsAudit = {
  generatedAt: string
  mole: {
    doingJob: boolean
    verdict: string
    chip: Awaited<ReturnType<typeof getNightCleanerChip>>
    openNightCleanerTickets: number
    cronWiredInRepo: true
    deskMolesCronWired: true
    nightCleanerCronWired: false
    scannersWiredInRepo: false
    gaps: string[]
  }
  knights: {
    runbooks: { promoted: number; draft: number; rejected: number }
    /** DRAFT runbooks — unconfirmed; may be speculative until William promotes */
    draftRunbooks: {
      id: string
      title: string
      fingerprint: string
      productLine: string
      hitCount: number
      evalScore: number | null
      denyIfCore: boolean
      updatedAt: string
      sourceTicketId: string | null
      risk: 'review' | 'likely_hallucination' | 'needs_confirm'
    }[]
    evals: {
      recentCount: number
      matchedCount: number
      unmatchedCount: number
      avgScore: number | null
      /** Low-score unmatched = draft did not match final fix */
      hallucinationSuspects: {
        id: string
        ticketId: string
        score: number
        fingerprint: string | null
        productLine: string | null
        createdAt: string
        draftPreview: string
        finalPreview: string
      }[]
    }
    openSystemTickets: {
      id: string
      subject: string
      status: string
      moduleHint: string | null
      agentWorking: boolean
      priority: string
      updatedAt: string
    }[]
    coreDeniedAudits7d: number
  }
  recommendations: string[]
}

function draftRisk(input: {
  evalScore: number | null
  hitCount: number
  denyIfCore: boolean
}): 'review' | 'likely_hallucination' | 'needs_confirm' {
  if (input.denyIfCore && (input.evalScore == null || input.evalScore < 0.5)) {
    return 'likely_hallucination'
  }
  if (input.evalScore != null && input.evalScore < 0.4) {
    return 'likely_hallucination'
  }
  if (input.evalScore == null && input.hitCount <= 1) {
    return 'needs_confirm'
  }
  return 'review'
}

export async function buildMoleKnightsAudit(): Promise<MoleKnightsAudit> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    chip,
    openNcTickets,
    promoted,
    draft,
    rejected,
    draftRows,
    recentEvals,
    openSystem,
    coreDeniedAudits7d,
  ] = await Promise.all([
    getNightCleanerChip(),
    db.helpTicket.count({
      where: { moduleHint: 'night-cleaner', status: { in: [...OPEN] } },
    }),
    db.knightRunbook.count({ where: { status: 'PROMOTED' } }),
    db.knightRunbook.count({ where: { status: 'DRAFT' } }),
    db.knightRunbook.count({ where: { status: 'REJECTED' } }),
    db.knightRunbook.findMany({
      where: { status: 'DRAFT' },
      orderBy: [{ hitCount: 'desc' }, { updatedAt: 'desc' }],
      take: 40,
      select: {
        id: true,
        title: true,
        fingerprint: true,
        productLine: true,
        hitCount: true,
        evalScore: true,
        denyIfCore: true,
        updatedAt: true,
        sourceTicketId: true,
      },
    }),
    db.knightEval.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        ticketId: true,
        score: true,
        matched: true,
        fingerprint: true,
        productLine: true,
        draftText: true,
        finalFixText: true,
        createdAt: true,
      },
    }),
    db.helpTicket.findMany({
      where: {
        channel: 'SYSTEM',
        status: { in: [...OPEN] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        subject: true,
        status: true,
        moduleHint: true,
        agentWorking: true,
        priority: true,
        updatedAt: true,
      },
    }),
    db.auditLog.count({
      where: {
        action: 'help_desk.runbook.denied_core',
        createdAt: { gte: since7d },
      },
    }),
  ])

  const matchedCount = recentEvals.filter((e) => e.matched).length
  const unmatched = recentEvals.filter((e) => !e.matched)
  const avgScore =
    recentEvals.length > 0
      ? recentEvals.reduce((s, e) => s + e.score, 0) / recentEvals.length
      : null

  const hallucinationSuspects = unmatched
    .filter((e) => e.score < 0.45)
    .slice(0, 20)
    .map((e) => ({
      id: e.id,
      ticketId: e.ticketId,
      score: e.score,
      fingerprint: e.fingerprint,
      productLine: e.productLine,
      createdAt: e.createdAt.toISOString(),
      draftPreview: e.draftText.slice(0, 240),
      finalPreview: e.finalFixText.slice(0, 240),
    }))

  const gaps: string[] = []
  if (!chip.ingestedAt) {
    gaps.push('No ops.night_cleaner.ingest audit — mole has never filed a morning-open report.')
  } else if (chip.stale) {
    gaps.push('Last night-cleaner ingest is stale (>24h) — overnight walk is not current.')
  }
  gaps.push(
    'Pilot night-cleaner runner not wired — no scheduled POST to /api/ops/night-cleaner-report (desk moles cron runs daily 11:00 UTC; EKG sweep only when EKG is open).'
  )
  gaps.push(
    'Pilot static scanners + Playwright + EKG→report mapper still unwired (docs/NIGHT_CLEANER_MOLE.md §5).'
  )
  if (!process.env.CRON_SECRET?.trim()) {
    gaps.push('CRON_SECRET unset on Company OS — desk moles / night-cleaner / ops crons will 401 until pasted.')
  }
  gaps.push(
    'Browser EKG Panel Sweep only runs while EKG is mounted — not a scheduled pre-open walk.'
  )

  const doingJob = Boolean(chip.ingestedAt) && !chip.stale && chip.level !== 'unknown'
  const verdict = !chip.ingestedAt
    ? '✕ Mole not reporting — ingest never ran'
    : chip.stale
      ? '▲ Mole stale — last report too old for morning open'
      : chip.level === 'error'
        ? '✕ Last report blocks morning open — work Tasks ticket'
        : chip.level === 'warn'
          ? '▲ Mole reporting · day-shift attention needed'
          : '✓ Mole reported recently'

  const recommendations: string[] = []
  if (!doingJob) {
    recommendations.push(
      'Wire pilot night-cleaner runner → POST /api/ops/night-cleaner-report on a nightly cron (after close).'
    )
    recommendations.push(
      'Until scanners exist, run a dry-run report from EKG export or hand checklist so Dr. OS chip leaves “never”.'
    )
  }
  if (draft > 0) {
    recommendations.push(
      `Triage ${draft} DRAFT Knight runbook(s) on /lab/elite or Help Desk — promote real fixes, reject hallucinations.`
    )
  }
  if (hallucinationSuspects.length > 0) {
    recommendations.push(
      `${hallucinationSuspects.length} recent KnightEval(s) unmatched with score < 0.45 — drafts did not match final fixes; do not promote those fingerprints.`
    )
  }
  if (coreDeniedAudits7d > 0) {
    recommendations.push(
      `${coreDeniedAudits7d} core-path deny(s) in 7d — constitution correctly blocked auth/middleware/secret hallucinations.`
    )
  }
  if (openSystem.filter((t) => t.agentWorking).length > 0) {
    recommendations.push(
      'Open SYSTEM tickets still marked agentWorking — finish dual-control resolve or clear stuck loops.'
    )
  }

  return {
    generatedAt: new Date().toISOString(),
    mole: {
      doingJob,
      verdict,
      chip,
      openNightCleanerTickets: openNcTickets,
      cronWiredInRepo: true,
      deskMolesCronWired: true,
      nightCleanerCronWired: false,
      scannersWiredInRepo: false,
      gaps,
    },
    knights: {
      runbooks: { promoted, draft, rejected },
      draftRunbooks: draftRows.map((r) => ({
        id: r.id,
        title: r.title,
        fingerprint: r.fingerprint,
        productLine: r.productLine,
        hitCount: r.hitCount,
        evalScore: r.evalScore,
        denyIfCore: r.denyIfCore,
        updatedAt: r.updatedAt.toISOString(),
        sourceTicketId: r.sourceTicketId,
        risk: draftRisk({
          evalScore: r.evalScore,
          hitCount: r.hitCount,
          denyIfCore: r.denyIfCore,
        }),
      })),
      evals: {
        recentCount: recentEvals.length,
        matchedCount,
        unmatchedCount: unmatched.length,
        avgScore,
        hallucinationSuspects,
      },
      openSystemTickets: openSystem.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        moduleHint: t.moduleHint,
        agentWorking: t.agentWorking,
        priority: t.priority,
        updatedAt: t.updatedAt.toISOString(),
      })),
      coreDeniedAudits7d,
    },
    recommendations,
  }
}
