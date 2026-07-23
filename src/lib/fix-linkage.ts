/**
 * Deployed-SHA ↔ ticket linkage (TICKET_VS_CODE_FIX_AUDIT.md P2 — now built).
 *
 * Two hooks close the honesty gap between "reply sent" and "code shipped":
 *  1. PR merged (GitHub webhook)  → stamp fixedInSha on linked tickets.
 *  2. Deploy went live (Render webhook) → flip productFixDeployed + tell the
 *     ticket "fix live in <sha>" — the receipt that code actually reached
 *     production, not just a chat reply.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { recordTimelineEvent } from '@/lib/help-timeline'

function shortSha(sha: string | null | undefined): string | null {
  const s = (sha ?? '').trim()
  return s ? s.slice(0, 7) : null
}

/** GitHub `pull_request` closed+merged → fixedInSha on linked tickets. */
export async function recordMergedFix(payload: {
  action?: string
  pull_request?: {
    number?: number
    merged?: boolean
    merge_commit_sha?: string | null
    head?: { ref?: string | null } | null
  } | null
}): Promise<{ linked: number }> {
  const pr = payload.pull_request
  if (payload.action !== 'closed' || !pr?.merged) return { linked: 0 }

  const sha = shortSha(pr.merge_commit_sha)
  const prNumber = pr.number ?? null
  const branch = pr.head?.ref ?? null
  if (!sha || (!prNumber && !branch)) return { linked: 0 }

  const works = await db.workRequest.findMany({
    where: {
      OR: [
        ...(prNumber !== null
          ? [{ context: { path: ['githubDraftPr', 'number'], equals: prNumber } }]
          : []),
        ...(branch
          ? [{ context: { path: ['prPlan', 'branchName'], equals: branch } }]
          : []),
      ],
    },
    select: { id: true },
  })
  if (works.length === 0) return { linked: 0 }

  const tickets = await db.helpTicket.findMany({
    where: { workRequestId: { in: works.map((w) => w.id) } },
    select: { id: true },
  })

  for (const t of tickets) {
    await db.helpTicket
      .update({ where: { id: t.id }, data: { fixedInSha: sha } })
      .catch(() => {})
    await db.helpMessage
      .create({
        data: {
          ticketId: t.id,
          role: 'SYSTEM',
          body: `Fix merged${prNumber ? ` (PR #${prNumber})` : ''} in ${sha}. Not live yet — will confirm here when the deploy lands.`,
        },
      })
      .catch(() => {})
  }

  await audit('computer_agent', 'help_desk.fix.merged', undefined, {
    sha,
    prNumber,
    branch,
    tickets: tickets.map((t) => t.id),
  }).catch(() => {})

  return { linked: tickets.length }
}

/** Live deploy of a commit → productFixDeployed receipt on matching tickets. */
export async function markFixDeployedForCommit(
  commitSha: string | null | undefined
): Promise<{ confirmed: number }> {
  const sha = shortSha(commitSha)
  if (!sha) return { confirmed: 0 }

  const tickets = await db.helpTicket.findMany({
    where: { fixedInSha: sha, productFixDeployed: false },
    select: { id: true, notifyWhenFixed: true },
  })
  if (tickets.length === 0) return { confirmed: 0 }

  for (const t of tickets) {
    await db.helpTicket
      .update({ where: { id: t.id }, data: { productFixDeployed: true } })
      .catch(() => {})
    await db.helpMessage
      .create({
        data: {
          ticketId: t.id,
          role: 'SYSTEM',
          body: `PRODUCT FIX DEPLOYED — live in ${sha}. closeReason=resolved_fix is now truthful for this ticket.`,
        },
      })
      .catch(() => {})
    await recordTimelineEvent({
      ticketId: t.id,
      kind: 'fixed',
      label: 'Fix deployed to production',
      detail: `Commit ${sha} is live`,
      actor: 'computer_agent',
    }).catch(() => {})
  }

  await audit('computer_agent', 'help_desk.fix.deployed', undefined, {
    sha,
    tickets: tickets.map((t) => t.id),
  }).catch(() => {})

  return { confirmed: tickets.length }
}
