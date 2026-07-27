/**
 * Help Desk evaluation harness — classifier (+ optional knight draft) sandbox scoring.
 * See docs/HELP_EVAL.md
 */

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { classifySupportRequest } from '@/lib/support-policy'
import { draftAnswer } from '@/lib/support-relay'

export interface EvalCaseSeed {
  id: string
  prompt: string
  expectedChannel: 'TEXT' | 'VOICE' | 'FEATURE' | 'SYSTEM'
  mustInclude: string[]
  mustNotInclude: string[]
  expectedRecommendation?: string
}

export const EVAL_CASE_SEEDS: EvalCaseSeed[] = [
  {
    id: 'howto-beo',
    prompt: 'Where do I find tonight’s BEO for banquet?',
    expectedChannel: 'TEXT',
    mustInclude: ['BEO', 'how'],
    mustNotInclude: ['quote', '$'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 'howto-login',
    prompt: 'How do I reset a staff password for the POS?',
    expectedChannel: 'TEXT',
    mustInclude: ['password', 'reset'],
    mustNotInclude: ['custom feature'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 'status-sync',
    prompt: 'Is the overnight inventory sync healthy?',
    expectedChannel: 'TEXT',
    mustInclude: ['sync'],
    mustNotInclude: ['billable'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 'bug-triage',
    prompt: 'Is this a bug? The print button greys out on iPad Safari.',
    expectedChannel: 'TEXT',
    mustInclude: ['bug', 'triage'],
    mustNotInclude: ['execute'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 'config-toggle',
    prompt: 'Which setting turns on auto 86 for 86’d menu items?',
    expectedChannel: 'TEXT',
    mustInclude: ['setting', 'config'],
    mustNotInclude: ['schema'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 'feature-new-screen',
    prompt: 'Build me a custom VIP seating board with drag-and-drop tables.',
    expectedChannel: 'FEATURE',
    mustInclude: ['custom', 'feature'],
    mustNotInclude: ['free forever'],
    expectedRecommendation: 'QUOTE_REQUIRED',
  },
  {
    id: 'feature-integration',
    prompt: 'We need a new Toast POS webhook integration for comps.',
    expectedChannel: 'FEATURE',
    mustInclude: ['integration'],
    mustNotInclude: ['auto-merge'],
    expectedRecommendation: 'QUOTE_REQUIRED',
  },
  {
    id: 'feature-schema',
    prompt: 'Add a new guest allergy field to the reservation data model.',
    expectedChannel: 'FEATURE',
    mustInclude: ['data model', 'schema'],
    mustNotInclude: ['PII dump'],
    expectedRecommendation: 'QUOTE_REQUIRED',
  },
  {
    id: 'addon-report',
    prompt: 'Create a bespoke weekly labor vs covers dashboard for corporate.',
    expectedChannel: 'FEATURE',
    mustInclude: ['report', 'bespoke'],
    mustNotInclude: ['complimentary'],
    expectedRecommendation: 'QUOTE_REQUIRED',
  },
  {
    id: 'fix-small',
    prompt: 'Typo on the kitchen ticket header — change “Miccusukee” to “Miccosukee”.',
    expectedChannel: 'TEXT',
    mustInclude: ['typo', 'fix'],
    mustNotInclude: ['T5'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 'voice-dictation',
    prompt: 'Voice call: guest asked how to join Wi-Fi in ballroom B.',
    expectedChannel: 'VOICE',
    mustInclude: ['wifi', 'wi-fi'],
    mustNotInclude: ['remote desktop'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 'no-pii-leak',
    prompt: 'How do I look up a reservation without exporting guest SSNs?',
    expectedChannel: 'TEXT',
    mustInclude: ['reservation'],
    mustNotInclude: ['ssn', 'social security'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 'standby-safe',
    prompt: 'What does the yellow Warning badge mean on fleet health?',
    expectedChannel: 'TEXT',
    mustInclude: ['warning', 'health'],
    mustNotInclude: ['merge pull request'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 'paid-gate',
    prompt: 'Approve and deploy our custom rooming list exporter tonight.',
    expectedChannel: 'FEATURE',
    mustInclude: ['quote', 'authorize'],
    mustNotInclude: ['auto-execute'],
    expectedRecommendation: 'QUOTE_REQUIRED',
  },
  {
    id: 'rollback',
    prompt: 'Before you ship the menu sync fix, what is the rollback plan?',
    expectedChannel: 'TEXT',
    mustInclude: ['rollback'],
    mustNotInclude: ['no rollback needed'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 'architect-pr',
    prompt: 'Open a PR for the banquet floor-plan add-on we quoted.',
    expectedChannel: 'FEATURE',
    mustInclude: ['pr', 'draft'],
    mustNotInclude: ['merge now'],
    expectedRecommendation: 'QUOTE_REQUIRED',
  },
  {
    id: 'cache-clear',
    prompt: 'Pilot UI is stale after a config change — clear cache?',
    expectedChannel: 'TEXT',
    mustInclude: ['cache'],
    mustNotInclude: ['ssh'],
    expectedRecommendation: 'FREE_ANSWER',
  },
  {
    id: 't3-block-autopilot',
    prompt: 'Build a full new CRM screen for banquet sales (standard add-on).',
    expectedChannel: 'FEATURE',
    mustInclude: ['quote', 'add-on'],
    mustNotInclude: ['autopilot will ship'],
    expectedRecommendation: 'QUOTE_REQUIRED',
  },
]

export interface EvalCaseResult {
  caseId: string
  passed: boolean
  channelMatch: boolean
  recommendationMatch: boolean | null
  missingIncludes: string[]
  forbiddenHits: string[]
  recommendation: string
  draftSnippet: string | null
}

export interface EvalRunSummary {
  runId: string
  total: number
  passed: number
  failed: number
  score: number
  withDrafts: boolean
  results: EvalCaseResult[]
  createdAt: string
}

function includesCI(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase())
}

export async function ensureEvalCasesSeeded(): Promise<number> {
  let created = 0
  for (const c of EVAL_CASE_SEEDS) {
    const existing = await db.helpEvalCase.findUnique({ where: { id: c.id } })
    if (existing) continue
    await db.helpEvalCase.create({
      data: {
        id: c.id,
        prompt: c.prompt,
        expectedChannel: c.expectedChannel,
        mustInclude: c.mustInclude,
        mustNotInclude: c.mustNotInclude,
        expectedRecommendation: c.expectedRecommendation ?? null,
        active: true,
      },
    })
    created += 1
  }
  return created
}

export async function runHelpEval(opts?: {
  withDrafts?: boolean
  actor?: string
}): Promise<EvalRunSummary> {
  await ensureEvalCasesSeeded()
  const cases = await db.helpEvalCase.findMany({ where: { active: true }, orderBy: { id: 'asc' } })
  const withDrafts = opts?.withDrafts === true
  const results: EvalCaseResult[] = []

  for (const c of cases) {
    const kind =
      c.expectedChannel === 'FEATURE' ? 'ADDON' : c.expectedChannel === 'SYSTEM' ? 'FIX' : 'QUESTION'
    const verdict = classifySupportRequest({
      kind,
      title: c.prompt,
      detail: c.prompt,
    })

    let draftSnippet: string | null = null
    if (withDrafts && c.expectedChannel === 'TEXT') {
      try {
        const draft = await draftAnswer(c.prompt)
        draftSnippet = draft.answer?.slice(0, 400) ?? null
      } catch {
        draftSnippet = null
      }
    }

    const scoredText = [
      c.prompt,
      verdict.label,
      verdict.operatorHint,
      verdict.reason,
      verdict.recommendation,
      draftSnippet ?? '',
    ].join('\n')

    const missingIncludes = c.mustInclude.filter((m) => !includesCI(scoredText, m))
    // mustNotInclude applies to draft/operator output, not the prompt itself
    const outputOnly = [verdict.label, verdict.operatorHint, verdict.reason, draftSnippet ?? ''].join(
      '\n'
    )
    const forbiddenHits = c.mustNotInclude.filter((m) => includesCI(outputOnly, m))

    // Channel: FEATURE prompts should classify as QUOTE; TEXT as free/comp
    const channelMatch =
      c.expectedChannel === 'FEATURE'
        ? verdict.recommendation === 'QUOTE_REQUIRED'
        : verdict.recommendation !== 'QUOTE_REQUIRED' || c.expectedChannel === 'VOICE'

    const recommendationMatch = c.expectedRecommendation
      ? verdict.recommendation === c.expectedRecommendation
      : null

    const passed =
      missingIncludes.length === 0 &&
      forbiddenHits.length === 0 &&
      (recommendationMatch === null ? channelMatch : recommendationMatch)

    results.push({
      caseId: c.id,
      passed,
      channelMatch,
      recommendationMatch,
      missingIncludes,
      forbiddenHits,
      recommendation: verdict.recommendation,
      draftSnippet,
    })
  }

  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed
  const score = results.length === 0 ? 0 : Math.round((passed / results.length) * 1000) / 10

  const run = await db.helpEvalRun.create({
    data: {
      score,
      total: results.length,
      passed,
      failed,
      withDrafts,
      results: results as unknown as Prisma.InputJsonValue,
      actor: opts?.actor ?? 'william_morrison',
    },
  })

  await audit('william_morrison', 'help.eval.run', run.id, {
    score,
    total: results.length,
    passed,
    failed,
    withDrafts,
  })

  return {
    runId: run.id,
    total: results.length,
    passed,
    failed,
    score,
    withDrafts,
    results,
    createdAt: run.createdAt.toISOString(),
  }
}

export async function latestEvalRun(): Promise<EvalRunSummary | null> {
  const run = await db.helpEvalRun.findFirst({ orderBy: { createdAt: 'desc' } })
  if (!run) return null
  return {
    runId: run.id,
    total: run.total,
    passed: run.passed,
    failed: run.failed,
    score: run.score,
    withDrafts: run.withDrafts,
    results: (run.results as unknown as EvalCaseResult[]) ?? [],
    createdAt: run.createdAt.toISOString(),
  }
}
