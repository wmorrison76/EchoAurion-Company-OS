/**
 * Quote → Help File draft for T3+ paid builds (tenant-scrubbed).
 * Creates an internal draft article — not public until William toggles public.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { redactSensitive, assertPiiFree } from '@/lib/error-redact'
import { slugify, toArticleView } from '@/lib/help-files'
import type { HelpArticleView } from '@/types/help-files'

const PROMOTE_TIERS = new Set(['T3', 'T4', 'T5'])

function scrubTenant(text: string): string {
  let s = redactSensitive(text, 4000)
  // Opaque install ids / client keys often look like kebab tokens — soften
  s = s.replace(/\bclient[_-]?key\s*[=:]\s*\S+/gi, 'clientKey=[redacted]')
  s = s.replace(/\b[a-z0-9]{8,}[-_][a-z0-9_-]{6,}\b/gi, '[install-id]')
  return s
}

export async function promoteWorkToHelpFile(input: {
  workRequestId: string
  actor?: 'william_morrison' | 'computer_agent'
  makePublic?: boolean
}): Promise<
  | { ok: true; article: HelpArticleView; created: boolean }
  | { ok: false; error: string; code?: string }
> {
  const work = await db.workRequest.findUnique({
    where: { id: input.workRequestId },
    include: { agreement: true },
  })
  if (!work) return { ok: false, error: 'Work request not found', code: 'NOT_FOUND' }

  const tier = (work.tier ?? '').toUpperCase()
  if (!PROMOTE_TIERS.has(tier)) {
    return {
      ok: false,
      error: 'Help File promotion is for T3+ paid builds only',
      code: 'TIER',
    }
  }
  if (work.status !== 'EXECUTED' && work.status !== 'AUTHORIZED' && work.status !== 'IN_PROGRESS') {
    return {
      ok: false,
      error: 'Promote after quote is authorized or executed',
      code: 'STATUS',
    }
  }

  const titleRaw = scrubTenant(work.title).slice(0, 120) || 'Paid build notes'
  const title = `Build notes: ${titleRaw}`
  const slugBase = slugify(`build-${tier}-${titleRaw}`) || `build-${work.id.slice(0, 8)}`
  const slug = `${slugBase}`.slice(0, 80)

  const existing = await db.helpArticle.findUnique({ where: { slug } })
  if (existing) {
    return { ok: true, article: toArticleView(existing), created: false }
  }

  const detail = scrubTenant(work.detail)
  const plan = work.draftPlan ? scrubTenant(work.draftPlan) : null
  const bodyParts = [
    `# ${title}`,
    '',
    `> Tenant-scrubbed draft from WorkRequest · tier ${tier} · status ${work.status}.`,
    `> Do not publish externally until reviewed. No guest PII.`,
    '',
    '## What was built',
    detail,
  ]
  if (plan) {
    bodyParts.push('', '## Implementation notes (scrubbed)', plan)
  }
  bodyParts.push(
    '',
    '## Operator checklist',
    '- Confirm blast radius / canary if code shipped',
    '- Toggle **public** only after scrub review',
    '- Link related Help Desk macros if this is a repeat ask',
    ''
  )
  const body = bodyParts.join('\n')
  const pii = assertPiiFree(body)
  if (!pii.ok) {
    return { ok: false, error: `PII gate blocked promote (${pii.reason})`, code: 'PII' }
  }

  const article = await db.helpArticle.create({
    data: {
      slug,
      title,
      body,
      tags: ['paid-build', 'draft', tier.toLowerCase(), 'from-quote'],
      panelId: null,
      public: input.makePublic === true,
      isMacro: false,
    },
  })

  await audit(input.actor ?? 'william_morrison', 'help_files.article.from_quote', article.id, {
    workRequestId: work.id,
    tier,
    slug,
  })

  // Public promote only — draft paid-build notes stay out of fleet learning until ops-tagged/public.
  if (article.public === true) {
    const { queueLearnFromHelp } = await import('@/lib/echo-learning')
    void queueLearnFromHelp(article.id).catch(() => {})
  }

  return { ok: true, article: toArticleView(article), created: true }
}
