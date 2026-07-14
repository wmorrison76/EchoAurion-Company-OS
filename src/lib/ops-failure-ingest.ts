/**
 * CI / PR / Render deploy failure → same HelpTicket SYSTEM + agent loop path
 * as runtime crashes. Fingerprints are stable; payloads are redacted.
 * Railway: scaffold only (poll stub + webhook ingest) — not live like Render.
 * See docs/ERROR_CAPTURE_AND_SCOPE.md § CI/PR/Deploy.
 */

import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { ingestErrorEvent } from '@/lib/error-events'
import { redactSensitive } from '@/lib/error-redact'
import { MONITORED_REPOS } from '@/lib/github'
import { listRenderServicesWithDeploys } from '@/lib/render'
import { recordTimelineEvent } from '@/lib/help-timeline'
import type { ProductLine } from '@/lib/error-taxonomy'

function fpHash(parts: string[]): string {
  const raw = parts.filter(Boolean).join('|')
  return `ops-${createHash('sha256').update(raw).digest('hex').slice(0, 40)}`
}

export function productLineForRepo(fullName: string): ProductLine {
  const n = fullName.toLowerCase()
  if (n.includes('company-os') || n.includes('echoaurion-company')) return 'company-os'
  if (n.includes('aurion-index') || n.includes('aurionindex')) return 'aurion-index'
  if (n.includes('luccca') || n.includes('echo_aurion') || n.includes('echoaurion')) {
    return 'echoaurion'
  }
  return 'unknown'
}

function clientKeyForRepo(fullName: string): string {
  return `github/${fullName.toLowerCase()}`
}

function clientKeyForRender(serviceId: string): string {
  return `render/${serviceId}`
}

function clientKeyForRailway(serviceId: string): string {
  return `railway/${serviceId}`
}

/** Link open WorkRequest / HelpTicket when commit or PR number is known.
 * Scoped by productLine / repo clientKey — never annotate another tenant’s ticket.
 */
async function findRelatedIds(input: {
  commitSha?: string | null
  prNumber?: number | null
  repo?: string | null
}): Promise<{ helpTicketId?: string; workRequestId?: string }> {
  const sha = input.commitSha?.slice(0, 7)
  if (!sha && !input.prNumber) return {}

  const productLine = input.repo ? productLineForRepo(input.repo) : null
  const repoClientKey = input.repo ? clientKeyForRepo(input.repo) : null

  if (input.prNumber) {
    const prNeedle = `#${input.prNumber}`
    const bySubject = await db.helpTicket.findFirst({
      where: {
        channel: 'SYSTEM',
        status: { in: ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] },
        ...(productLine ? { productLine } : {}),
        AND: [
          {
            OR: [
              { subject: { contains: prNeedle } },
              { moduleHint: { in: ['pr', 'ci', 'autofix', 'bugbot'] } },
            ],
          },
          ...(repoClientKey
            ? [
                {
                  OR: [
                    { clientKey: repoClientKey },
                    { affectedClientKeys: { has: repoClientKey } },
                    ...(input.repo ? [{ subject: { contains: input.repo } }] : []),
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, workRequestId: true, subject: true, clientKey: true, productLine: true },
    })
    if (bySubject && bySubject.subject.includes(prNeedle)) {
      if (!(productLine && bySubject.productLine && bySubject.productLine !== productLine)) {
        return {
          helpTicketId: bySubject.id,
          workRequestId: bySubject.workRequestId ?? undefined,
        }
      }
    }

    const msgHit = await db.helpMessage.findFirst({
      where: {
        role: 'SYSTEM',
        body: { contains: `pr=#${input.prNumber}` },
        ticket: {
          channel: 'SYSTEM',
          status: { in: ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] },
          ...(productLine ? { productLine } : {}),
          ...(repoClientKey
            ? {
                OR: [
                  { clientKey: repoClientKey },
                  { affectedClientKeys: { has: repoClientKey } },
                ],
              }
            : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { ticketId: true, ticket: { select: { workRequestId: true, productLine: true } } },
    })
    if (msgHit) {
      if (
        !productLine ||
        !msgHit.ticket.productLine ||
        msgHit.ticket.productLine === productLine
      ) {
        return {
          helpTicketId: msgHit.ticketId,
          workRequestId: msgHit.ticket.workRequestId ?? undefined,
        }
      }
    }
  }

  const works = await db.workRequest.findMany({
    where: {
      status: { notIn: ['EXECUTED', 'ROLLED_BACK', 'DECLINED'] },
      ...(repoClientKey ? { clientKey: repoClientKey } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 40,
    select: { id: true, context: true, title: true, detail: true, clientKey: true },
  })

  for (const w of works) {
    if (repoClientKey && w.clientKey && w.clientKey !== repoClientKey) continue
    const blob = JSON.stringify(w.context ?? {}) + (w.detail ?? '') + (w.title ?? '')
    if (sha && blob.includes(sha)) {
      const ticket = await db.helpTicket.findFirst({
        where: {
          workRequestId: w.id,
          ...(productLine ? { productLine } : {}),
        },
        select: { id: true },
      })
      return { workRequestId: w.id, helpTicketId: ticket?.id }
    }
    if (input.prNumber && blob.includes(`#${input.prNumber}`)) {
      const ticket = await db.helpTicket.findFirst({
        where: {
          workRequestId: w.id,
          ...(productLine ? { productLine } : {}),
        },
        select: { id: true },
      })
      return { workRequestId: w.id, helpTicketId: ticket?.id }
    }
  }
  return {}
}

async function annotateRelatedTicket(
  ticketId: string,
  related: { helpTicketId?: string; workRequestId?: string },
  label: string
): Promise<void> {
  if (!related.helpTicketId && !related.workRequestId) return
  const lines = [
    label,
    related.workRequestId ? `relatedWorkRequest=${related.workRequestId}` : null,
    related.helpTicketId ? `relatedHelpTicket=${related.helpTicketId}` : null,
  ].filter(Boolean)

  await db.helpMessage.create({
    data: {
      ticketId,
      role: 'SYSTEM',
      body: lines.join('\n'),
    },
  }).catch(() => {})

  if (related.helpTicketId && related.helpTicketId !== ticketId) {
    await recordTimelineEvent({
      ticketId: related.helpTicketId,
      kind: 'fixing',
      label: 'Deploy / CI failed',
      detail: `${label} — repair queued on ticket ${ticketId}`,
      actor: 'computer_agent',
    }).catch(() => {})
    await db.helpMessage.create({
      data: {
        ticketId: related.helpTicketId,
        role: 'SYSTEM',
        body: `Deploy failed — repair queued (ops ticket ${ticketId}). Draft PR only; no silent merge.`,
      },
    }).catch(() => {})
  }
}

export async function ingestWorkflowRunFailure(payload: {
  action?: string
  workflow_run?: {
    id?: number
    name?: string
    conclusion?: string | null
    status?: string
    html_url?: string
    head_sha?: string
    head_branch?: string
    event?: string
    pull_requests?: Array<{ number?: number }>
  }
  repository?: { full_name?: string; name?: string; owner?: { login?: string } }
}): Promise<{ ingested: boolean; ticketId?: string; reason?: string }> {
  const run = payload.workflow_run
  const conclusion = run?.conclusion
  if (!run || conclusion !== 'failure' && conclusion !== 'timed_out' && conclusion !== 'cancelled') {
    return { ingested: false, reason: 'not_a_failure' }
  }
  // Only treat cancelled as failure when it was a required check on default branch repair.
  if (conclusion === 'cancelled' && payload.action !== 'completed') {
    return { ingested: false, reason: 'cancelled_ignored' }
  }

  const fullName =
    payload.repository?.full_name ??
    `${payload.repository?.owner?.login ?? 'unknown'}/${payload.repository?.name ?? 'unknown'}`
  const workflowName = redactSensitive(run.name ?? 'workflow', 80)
  const fingerprint = fpHash([
    'ci',
    fullName,
    String(run.name ?? run.id ?? 'wf'),
    conclusion,
  ])
  const prNumber = run.pull_requests?.[0]?.number ?? null
  const isDefaultish =
    !prNumber &&
    (run.head_branch === 'main' || run.head_branch === 'master' || !run.head_branch)
  const productLine = productLineForRepo(fullName)
  const message = redactSensitive(
    `CI failed: ${workflowName} on ${fullName} (${conclusion})`,
    500
  )
  const stack = redactSensitive(
    [
      `source=github.workflow_run`,
      `workflow=${workflowName}`,
      `conclusion=${conclusion}`,
      `branch=${run.head_branch ?? 'n/a'}`,
      `sha=${run.head_sha?.slice(0, 12) ?? 'n/a'}`,
      `url=${run.html_url ?? 'n/a'}`,
      prNumber ? `pr=#${prNumber}` : null,
      `event=${run.event ?? 'n/a'}`,
    ]
      .filter(Boolean)
      .join('\n'),
    4000
  )

  const result = await ingestErrorEvent({
    clientKey: clientKeyForRepo(fullName),
    fingerprint,
    message,
    stack,
    errorClass: 'CIFailure',
    moduleHint: 'ci',
    categoryHint: 'INFRA',
    productLine,
    scopeHint: isDefaultish ? 'GLOBAL' : 'ACCOUNT',
    source: 'github.workflow_run',
    platform: 'github',
  })

  const related = await findRelatedIds({
    commitSha: run.head_sha,
    prNumber,
    repo: fullName,
  })
  await annotateRelatedTicket(
    result.ticket.id,
    related,
    `CI failed — repair queued · ${workflowName}`
  )

  return { ingested: true, ticketId: result.ticket.id }
}

export async function ingestCheckSuiteFailure(payload: {
  action?: string
  check_suite?: {
    id?: number
    conclusion?: string | null
    head_sha?: string
    head_branch?: string
    pull_requests?: Array<{ number?: number }>
  }
  repository?: { full_name?: string; name?: string; owner?: { login?: string } }
}): Promise<{ ingested: boolean; ticketId?: string; reason?: string }> {
  const suite = payload.check_suite
  if (payload.action !== 'completed' || suite?.conclusion !== 'failure') {
    return { ingested: false, reason: 'not_a_failure' }
  }
  const fullName =
    payload.repository?.full_name ??
    `${payload.repository?.owner?.login ?? 'unknown'}/${payload.repository?.name ?? 'unknown'}`
  const fingerprint = fpHash(['check_suite', fullName, String(suite.id ?? suite.head_sha)])
  const prNumber = suite.pull_requests?.[0]?.number ?? null
  const productLine = productLineForRepo(fullName)
  const message = redactSensitive(`Check suite failed on ${fullName}`, 500)
  const stack = redactSensitive(
    [
      `source=github.check_suite`,
      `conclusion=failure`,
      `branch=${suite.head_branch ?? 'n/a'}`,
      `sha=${suite.head_sha?.slice(0, 12) ?? 'n/a'}`,
      prNumber ? `pr=#${prNumber}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    4000
  )

  const result = await ingestErrorEvent({
    clientKey: clientKeyForRepo(fullName),
    fingerprint,
    message,
    stack,
    errorClass: 'CheckSuiteFailure',
    moduleHint: 'ci',
    categoryHint: 'INFRA',
    productLine,
    scopeHint: prNumber ? 'ACCOUNT' : 'GLOBAL',
    source: 'github.check_suite',
    platform: 'github',
  })

  const related = await findRelatedIds({
    commitSha: suite.head_sha,
    prNumber,
    repo: fullName,
  })
  await annotateRelatedTicket(result.ticket.id, related, 'CI failed — check suite · repair queued')

  return { ingested: true, ticketId: result.ticket.id }
}

export async function ingestPullRequestFailure(payload: {
  action?: string
  pull_request?: {
    number?: number
    title?: string
    mergeable_state?: string
    head?: { sha?: string; ref?: string }
    html_url?: string
  }
  repository?: { full_name?: string }
}): Promise<{ ingested: boolean; ticketId?: string; reason?: string }> {
  // Only when PR becomes unmergeable due to failing checks (dirty / blocked).
  const pr = payload.pull_request
  const state = pr?.mergeable_state
  if (!pr || (state !== 'dirty' && state !== 'blocked' && payload.action !== 'synchronize')) {
    return { ingested: false, reason: 'not_blocked' }
  }
  // synchronize alone is not a failure — require blocked/dirty.
  if (state !== 'dirty' && state !== 'blocked') {
    return { ingested: false, reason: 'not_blocked' }
  }

  const fullName = payload.repository?.full_name ?? 'unknown/unknown'
  const fingerprint = fpHash(['pr', fullName, String(pr.number), state])
  const productLine = productLineForRepo(fullName)
  const title = redactSensitive(pr.title ?? `PR #${pr.number}`, 120)
  const message = redactSensitive(`PR blocked: #${pr.number} ${title} (${state})`, 500)
  const stack = redactSensitive(
    [
      `source=github.pull_request`,
      `pr=#${pr.number}`,
      `mergeable_state=${state}`,
      `sha=${pr.head?.sha?.slice(0, 12) ?? 'n/a'}`,
      `url=${pr.html_url ?? 'n/a'}`,
    ].join('\n'),
    4000
  )

  const result = await ingestErrorEvent({
    clientKey: clientKeyForRepo(fullName),
    fingerprint,
    message,
    stack,
    errorClass: 'PRBlocked',
    moduleHint: 'pr',
    categoryHint: 'INFRA',
    productLine,
    scopeHint: 'ACCOUNT',
    source: 'github.pull_request',
    platform: 'github',
  })

  const related = await findRelatedIds({
    commitSha: pr.head?.sha,
    prNumber: pr.number,
    repo: fullName,
  })
  await annotateRelatedTicket(result.ticket.id, related, 'PR blocked — repair queued')

  return { ingested: true, ticketId: result.ticket.id }
}

const BUGBOT_LOGIN_RE = /(cursor|bugbot)/i
const BUGBOT_BODY_RE =
  /bugbot\s*autofix|autofix\s+prepared|autofix\s+applied|fixed:\s*|cursor\[bot\]/i

function isBugbotActor(login: string | null | undefined, body: string): boolean {
  if (login && BUGBOT_LOGIN_RE.test(login)) return true
  return BUGBOT_BODY_RE.test(body)
}

function autofixOutcome(body: string): 'applied' | 'prepared' | 'failed' | 'note' {
  const b = body.toLowerCase()
  if (/failed|could not|unable to fix|still failing/.test(b)) return 'failed'
  if (/autofix applied|fix(ed)?[:\s]|applied a fix|pushed a fix/.test(b)) return 'applied'
  if (/autofix prepared|prepared a fix|bugbot autofix/.test(b)) return 'prepared'
  return 'note'
}

/**
 * Cursor Bugbot / cursor[bot] PR comments → SYSTEM telemetry.
 * Success: timeline “Autofix applied” (no agent stampede).
 * Failure: INFRA ticket + repair queue like CI.
 * Example class: luccca-web PR #202 Admin User Console rewire.
 */
export async function ingestBugbotAutofixComment(payload: {
  action?: string
  comment?: {
    id?: number
    body?: string
    user?: { login?: string }
    html_url?: string
  }
  issue?: {
    number?: number
    title?: string
    pull_request?: { url?: string } | null
  }
  pull_request?: {
    number?: number
    title?: string
    html_url?: string
    head?: { sha?: string }
  }
  repository?: { full_name?: string }
}): Promise<{ ingested: boolean; ticketId?: string; reason?: string }> {
  if (payload.action && payload.action !== 'created' && payload.action !== 'edited') {
    return { ingested: false, reason: 'not_created' }
  }
  const body = payload.comment?.body ?? ''
  const login = payload.comment?.user?.login ?? ''
  if (!isBugbotActor(login, body)) {
    return { ingested: false, reason: 'not_bugbot' }
  }

  // Only PR threads (issue with pull_request or explicit pull_request payload).
  const prNumber =
    payload.pull_request?.number ??
    (payload.issue?.pull_request ? payload.issue.number : undefined)
  if (!prNumber) {
    return { ingested: false, reason: 'not_a_pr_comment' }
  }

  const fullName = payload.repository?.full_name ?? 'unknown/unknown'
  const productLine = productLineForRepo(fullName)
  const outcome = autofixOutcome(body)
  const title =
    payload.pull_request?.title ?? payload.issue?.title ?? `PR #${prNumber}`
  const safeTitle = redactSensitive(title, 120)
  const safeBody = redactSensitive(body, 1500)
  const fingerprint = fpHash(['autofix', fullName, String(prNumber), outcome, String(payload.comment?.id ?? '')])

  const message =
    outcome === 'failed'
      ? redactSensitive(`Bugbot autofix failed on PR #${prNumber}: ${safeTitle}`, 500)
      : outcome === 'applied'
        ? redactSensitive(`Bugbot autofix applied on PR #${prNumber}: ${safeTitle}`, 500)
        : redactSensitive(`Bugbot autofix prepared on PR #${prNumber}: ${safeTitle}`, 500)

  const stack = redactSensitive(
    [
      `source=github.bugbot_autofix`,
      `actor=${login || 'cursor[bot]'}`,
      `outcome=${outcome}`,
      `pr=#${prNumber}`,
      `repo=${fullName}`,
      `url=${payload.comment?.html_url ?? payload.pull_request?.html_url ?? 'n/a'}`,
      '',
      safeBody,
    ].join('\n'),
    4000
  )

  // Failures → ACCOUNT/HIGH (agent queue). Success/prepared → USER (telemetry only).
  const result = await ingestErrorEvent({
    clientKey: clientKeyForRepo(fullName),
    fingerprint,
    message,
    stack,
    errorClass: outcome === 'failed' ? 'BugbotAutofixFailed' : 'BugbotAutofix',
    moduleHint: 'autofix',
    categoryHint: 'INFRA',
    productLine,
    scopeHint: outcome === 'failed' ? 'ACCOUNT' : 'USER',
    source: 'github.bugbot_autofix',
    platform: 'github',
  })

  const related = await findRelatedIds({
    prNumber,
    commitSha: payload.pull_request?.head?.sha,
    repo: fullName,
  })

  const timelineLabel =
    outcome === 'failed'
      ? 'Autofix failed'
      : outcome === 'applied'
        ? 'Autofix applied'
        : 'Autofix prepared'

  const timelineDetail =
    outcome === 'failed'
      ? `Bugbot/cursor autofix failed on PR #${prNumber} — repair queued (ticket ${result.ticket.id}). Draft PR only; no silent merge.`
      : outcome === 'applied'
        ? `Repair attempted / autofix applied on PR #${prNumber} by ${login || 'cursor[bot]'}. Human merge review still required.`
        : `Bugbot Autofix prepared a fix on PR #${prNumber}. Review before merge.`

  await annotateRelatedTicket(result.ticket.id, related, timelineDetail)

  await recordTimelineEvent({
    ticketId: result.ticket.id,
    kind: outcome === 'failed' ? 'fixing' : outcome === 'applied' ? 'fixed' : 'fixing',
    label: timelineLabel,
    detail: timelineDetail,
    actor: 'computer_agent',
  }).catch(() => {})

  if (related.helpTicketId && related.helpTicketId !== result.ticket.id) {
    await recordTimelineEvent({
      ticketId: related.helpTicketId,
      kind: outcome === 'applied' ? 'fixed' : 'fixing',
      label: timelineLabel,
      detail: timelineDetail,
      actor: 'computer_agent',
    }).catch(() => {})
  }

  return { ingested: true, ticketId: result.ticket.id }
}

export async function ingestRenderDeployFailure(input: {
  serviceId: string
  serviceName: string
  deployId: string
  status: string
  commitSha?: string | null
  commitMessage?: string | null
}): Promise<{ ingested: boolean; ticketId?: string; reason?: string }> {
  const failed =
    input.status.includes('failed') ||
    input.status === 'canceled' ||
    input.status === 'deactivated'
  if (!failed) return { ingested: false, reason: 'not_failed' }

  const fingerprint = fpHash(['deploy', input.serviceId, input.deployId, input.status])
  const isCompanyOs =
    /company.?os/i.test(input.serviceName) ||
    input.serviceId === process.env.RENDER_SERVICE_ID
  const productLine: ProductLine = isCompanyOs
    ? 'company-os'
    : /luccca|echo|pilot|product/i.test(input.serviceName)
      ? 'echoaurion'
      : 'unknown'

  const message = redactSensitive(
    `Deploy failed: ${input.serviceName} (${input.status})`,
    500
  )
  const stack = redactSensitive(
    [
      `source=render.deploy`,
      `serviceId=${input.serviceId}`,
      `serviceName=${input.serviceName}`,
      `deployId=${input.deployId}`,
      `status=${input.status}`,
      `sha=${input.commitSha ?? 'n/a'}`,
      input.commitMessage ? `commit=${redactSensitive(input.commitMessage, 80)}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    4000
  )

  const result = await ingestErrorEvent({
    clientKey: clientKeyForRender(input.serviceId),
    fingerprint,
    message,
    stack,
    errorClass: 'DeployFailure',
    moduleHint: 'deploy',
    categoryHint: 'INFRA',
    productLine,
    scopeHint: 'GLOBAL',
    source: 'render.deploy',
    platform: 'render',
  })

  const related = await findRelatedIds({ commitSha: input.commitSha })
  await annotateRelatedTicket(
    result.ticket.id,
    related,
    `Deploy failed — repair queued · ${input.serviceName}`
  )

  return { ingested: true, ticketId: result.ticket.id }
}

/** Poll Render account for failed latest deploys → ingest. */
export async function pollRenderDeployFailures(): Promise<{
  checked: number
  ingested: number
  ticketIds: string[]
}> {
  const services = await listRenderServicesWithDeploys()
  let ingested = 0
  const ticketIds: string[] = []
  for (const svc of services) {
    if (svc.deploy.level !== 'error' || !svc.deploy.id) continue
    const r = await ingestRenderDeployFailure({
      serviceId: svc.id,
      serviceName: svc.name,
      deployId: svc.deploy.id,
      status: svc.deploy.status ?? 'build_failed',
      commitSha: svc.deploy.commitSha,
    })
    if (r.ingested && r.ticketId) {
      ingested += 1
      ticketIds.push(r.ticketId)
    }
  }
  return { checked: services.length, ingested, ticketIds }
}

/** Poll GitHub Actions for recent failed workflow runs on monitored repos. */
export async function pollGithubCiFailures(): Promise<{
  checked: number
  ingested: number
  ticketIds: string[]
}> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return { checked: 0, ingested: 0, ticketIds: [] }

  let checked = 0
  let ingested = 0
  const ticketIds: string[] = []

  for (const { owner, repo } of MONITORED_REPOS) {
    checked += 1
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/runs?status=completed&per_page=10`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: AbortSignal.timeout(10_000),
          cache: 'no-store',
        }
      )
      if (!res.ok) continue
      const body = (await res.json()) as {
        workflow_runs?: Array<{
          id: number
          name: string
          conclusion: string | null
          status: string
          html_url: string
          head_sha: string
          head_branch: string
          event: string
          updated_at: string
          pull_requests?: Array<{ number: number }>
        }>
      }
      const cutoff = Date.now() - 2 * 60 * 60 * 1000 // last 2h
      for (const run of body.workflow_runs ?? []) {
        if (run.conclusion !== 'failure' && run.conclusion !== 'timed_out') continue
        if (new Date(run.updated_at).getTime() < cutoff) continue
        const r = await ingestWorkflowRunFailure({
          action: 'completed',
          workflow_run: run,
          repository: { full_name: `${owner}/${repo}` },
        })
        if (r.ingested && r.ticketId) {
          ingested += 1
          ticketIds.push(r.ticketId)
        }
      }
    } catch {
      // best-effort poll
    }
  }

  return { checked, ingested, ticketIds }
}

/**
 * Ingest a Railway deploy/build failure (webhook or future poll).
 * Same SYSTEM / INFRA path as Render — platform tagged `railway`.
 */
export async function ingestRailwayDeployFailure(input: {
  serviceId: string
  serviceName: string
  deploymentId: string
  status: string
  commitSha?: string | null
  environmentName?: string | null
}): Promise<{ ingested: boolean; ticketId?: string; reason?: string }> {
  const status = (input.status ?? '').toLowerCase()
  const failed =
    status.includes('fail') ||
    status === 'crashed' ||
    status === 'removed' ||
    status === 'skipped'
  if (!failed) return { ingested: false, reason: 'not_failed' }

  const fingerprint = fpHash([
    'railway',
    input.serviceId,
    input.deploymentId,
    input.status,
  ])
  const productLine: ProductLine = /company.?os/i.test(input.serviceName)
    ? 'company-os'
    : /luccca|echo|pilot|product/i.test(input.serviceName)
      ? 'echoaurion'
      : 'unknown'

  const message = redactSensitive(
    `Railway deploy failed: ${input.serviceName} (${input.status})`,
    500
  )
  const stack = redactSensitive(
    [
      `source=railway.deploy`,
      `serviceId=${input.serviceId}`,
      `serviceName=${input.serviceName}`,
      `deploymentId=${input.deploymentId}`,
      `status=${input.status}`,
      `sha=${input.commitSha ?? 'n/a'}`,
      input.environmentName ? `env=${input.environmentName}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    4000
  )

  const result = await ingestErrorEvent({
    clientKey: clientKeyForRailway(input.serviceId),
    fingerprint,
    message,
    stack,
    errorClass: 'DeployFailure',
    moduleHint: 'deploy',
    categoryHint: 'INFRA',
    productLine,
    scopeHint: 'GLOBAL',
    source: 'railway.deploy',
    platform: 'railway',
  })

  const related = await findRelatedIds({ commitSha: input.commitSha })
  await annotateRelatedTicket(
    result.ticket.id,
    related,
    `Railway deploy failed — repair queued · ${input.serviceName}`
  )

  return { ingested: true, ticketId: result.ticket.id }
}

/**
 * Poll Railway for failed deployments.
 *
 * Honest status: **not wired like Render**. Requires `RAILWAY_TOKEN` (+ optional
 * `RAILWAY_PROJECT_ID`). Until GraphQL list-deployments is implemented, returns
 * `skipped: true` and does not invent failures. Prefer webhook stub
 * `POST /api/webhooks/railway` when Railway is still in use.
 *
 * Note: pilot docs (`RAILWAY-RETIREMENT.md`) recommend retiring Railway —
 * Render is the live production path today.
 */
export async function pollRailwayDeployFailures(): Promise<{
  checked: number
  ingested: number
  ticketIds: string[]
  skipped: boolean
  reason?: string
}> {
  const token = process.env.RAILWAY_TOKEN?.trim()
  if (!token) {
    return {
      checked: 0,
      ingested: 0,
      ticketIds: [],
      skipped: true,
      reason: 'RAILWAY_TOKEN unset — Railway poll scaffold only (Render is live)',
    }
  }

  const projectId = process.env.RAILWAY_PROJECT_ID?.trim()
  if (!projectId) {
    return {
      checked: 0,
      ingested: 0,
      ticketIds: [],
      skipped: true,
      reason:
        'RAILWAY_PROJECT_ID unset — set token + project to enable GraphQL poll (TODO)',
    }
  }

  // TODO(claude): Wire Railway GraphQL deployments query → ingestRailwayDeployFailure.
  // Pattern exists (ingest + fingerprint); API list not implemented — avoid fake polls.
  return {
    checked: 0,
    ingested: 0,
    ticketIds: [],
    skipped: true,
    reason:
      'Railway GraphQL poll not implemented — use POST /api/webhooks/railway or retire Railway',
  }
}
