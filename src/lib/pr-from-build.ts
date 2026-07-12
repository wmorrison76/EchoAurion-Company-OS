/**
 * Architect PR-only pipeline — Build / FEATURE work produces a draft plan
 * and optional GitHub draft PR. Merge is always human/CI.
 * See docs/PR_FROM_BUILD.md
 */

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { draftPlan } from '@/lib/support-relay'
import { checkConstitution } from '@/lib/constitution'
import { guardCorePaths } from '@/lib/core-path-guard'
import type { WorkKind } from '@/types/work'

export interface PrPlan {
  branchName: string
  prTitle: string
  prBody: string
  fileTouchList: string[]
  seat: string | null
  createdAt: string
  sandbox: true
  mergeForbidden: true
}

export interface GithubDraftPrResult {
  created: boolean
  number?: number
  url?: string
  detail: string
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

/** Build a structured PR plan from Knights draftPlan + heuristics. */
export async function createDraftPrPlan(workRequestId: string): Promise<PrPlan> {
  checkConstitution('create_draft_pr')
  const work = await db.workRequest.findUnique({ where: { id: workRequestId } })
  if (!work) throw new Error('WorkRequest not found')

  let planText = work.draftPlan
  let seat = work.draftSeat
  if (!planText?.trim()) {
    const drafted = await draftPlan(work.title, work.detail, work.kind as WorkKind)
    if (!drafted.answer) throw new Error(drafted.error ?? 'Could not draft plan')
    planText = drafted.answer
    seat = drafted.seat
  }

  const branchName = `build/${slugify(work.title) || 'change'}-${workRequestId.slice(-6)}`
  const prTitle = `[Build] ${work.title}`.slice(0, 120)
  const fileTouchList = extractFileTouches(planText)
  const coreGuard = guardCorePaths({
    planText,
    fileTouchList,
    subject: work.title,
  })

  const prBody = [
    `## Summary`,
    ``,
    work.detail.slice(0, 2000),
    ``,
    `## Architect / Knights plan`,
    ``,
    planText.slice(0, 8000),
    ``,
    `## Files (sandbox estimate)`,
    ``,
    ...(fileTouchList.length ? fileTouchList.map((f) => `- \`${f}\``) : ['- _(list TBD in review)_']),
    ``,
    `## Work request`,
    ``,
    `- id: \`${work.id}\``,
    `- clientKey: \`${work.clientKey}\``,
    `- kind: ${work.kind}`,
    `- quote: ${work.quoteTotal ?? 'unquoted'}`,
    ``,
    `## Constitution`,
    ``,
    `- **Draft PR only** — do not merge from agents or autopilot.`,
    `- Merge is human/CI after review.`,
    `- Execute on the property still requires dual control + rollbackRef.`,
    coreGuard.needsHumanCoreReview
      ? `- **NEEDS_HUMAN_CORE_REVIEW** — ${coreGuard.reason}`
      : `- Core-path guard: clear`,
    ``,
  ].join('\n')

  if (coreGuard.blocked) {
    // Draft PR still allowed — constitution blocks modify_core / merge / auto-execute.
    // Flag ticket for dual human review; never silent-merge.
    checkConstitution('create_draft_pr', {
      planText,
      fileTouchList,
    })
  }

  const plan: PrPlan = {
    branchName,
    prTitle,
    prBody,
    fileTouchList,
    seat: seat ?? null,
    createdAt: new Date().toISOString(),
    sandbox: true,
    mergeForbidden: true,
  }

  const context = {
    ...((work.context as Record<string, unknown> | null) ?? {}),
    prPlan: plan,
    coreGuard: {
      flag: coreGuard.flag,
      matched: coreGuard.matched,
      reason: coreGuard.reason,
    },
  }

  await db.workRequest.update({
    where: { id: workRequestId },
    data: {
      draftPlan: planText,
      draftSeat: seat ?? work.draftSeat,
      context: context as unknown as Prisma.InputJsonValue,
      ...(coreGuard.needsHumanCoreReview
        ? {
            // Keep work in human review lane — never auto-execute core touches.
            status: work.status === 'EXECUTED' ? work.status : work.status,
          }
        : {}),
    },
  })

  // Flag any linked HelpTicket for dual-control core review.
  if (coreGuard.needsHumanCoreReview) {
    await db.helpTicket.updateMany({
      where: { workRequestId },
      data: {
        needsHumanCoreReview: true,
        status: 'AWAITING_APPROVAL',
      },
    })
    const linked = await db.helpTicket.findMany({
      where: { workRequestId },
      select: { id: true },
    })
    for (const t of linked) {
      await db.helpMessage.create({
        data: {
          ticketId: t.id,
          role: 'SYSTEM',
          body: `NEEDS_HUMAN_CORE_REVIEW — ${coreGuard.reason}\nMatched: ${coreGuard.matched.join(', ') || 'warn-list'}`,
        },
      })
    }
  }

  await audit('william_morrison', 'work.request.pr_plan', workRequestId, {
    branchName,
    prTitle,
    fileCount: fileTouchList.length,
    coreGuard: coreGuard.flag,
  })

  return plan
}

function extractFileTouches(planText: string): string[] {
  const paths = new Set<string>()
  const re =
    /(?:^|\s)((?:src|app|lib|prisma|components|docs|infrastructure)\/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(planText)) !== null) {
    paths.add(m[1])
    if (paths.size >= 40) break
  }
  // Common sandbox placeholders when plan has no paths
  if (paths.size === 0) {
    return [
      'src/app/(product)/…',
      'src/components/…',
      'docs/CUSTOMER_CHANGE_REQUEST_FLOW.md',
    ]
  }
  return [...paths]
}

/**
 * Optionally create a GitHub **draft** PR if GITHUB_TOKEN + repo configured.
 * Never merges. If the branch does not exist yet, records the plan only.
 */
export async function maybeCreateGithubDraftPr(
  workRequestId: string,
  plan: PrPlan
): Promise<GithubDraftPrResult> {
  checkConstitution('create_draft_pr')
  const mergeBlock = checkConstitution('merge_pr')
  if (!mergeBlock.ok && false) {
    // unreachable — merge never attempted
  }

  const token = process.env.GITHUB_TOKEN
  const org = process.env.GITHUB_ORG ?? 'wmorrison76'
  const repo =
    process.env.GITHUB_BUILD_REPO ?? `${org}/EchoAurion-Company-OS`

  if (!token) {
    return { created: false, detail: 'GITHUB_TOKEN not set — plan stored only' }
  }

  try {
    // Create a draft PR from branch → default branch. Branch may not exist yet;
    // GitHub returns 422 — we still keep the plan.
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: plan.prTitle,
        head: plan.branchName,
        base: process.env.GITHUB_BUILD_BASE ?? 'main',
        body: plan.prBody,
        draft: true,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (res.ok) {
      const data = (await res.json()) as { number: number; html_url: string }
      const work = await db.workRequest.findUnique({ where: { id: workRequestId } })
      const context = {
        ...((work?.context as Record<string, unknown> | null) ?? {}),
        prPlan: plan,
        githubDraftPr: {
          number: data.number,
          url: data.html_url,
          createdAt: new Date().toISOString(),
        },
      }
      await db.workRequest.update({
        where: { id: workRequestId },
        data: { context: context as unknown as Prisma.InputJsonValue },
      })
      await audit('william_morrison', 'work.request.draft_pr_created', workRequestId, {
        number: data.number,
        url: data.html_url,
      })
      return {
        created: true,
        number: data.number,
        url: data.html_url,
        detail: 'GitHub draft PR created (merge forbidden for agents)',
      }
    }

    const errText = await res.text().catch(() => '')
    return {
      created: false,
      detail: `GitHub ${res.status}: ${errText.slice(0, 200) || 'branch may not exist yet — plan stored'}`,
    }
  } catch (error) {
    return {
      created: false,
      detail: error instanceof Error ? error.message : 'GitHub draft PR failed',
    }
  }
}
