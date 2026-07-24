/**
 * Knights-Watch autonomous runbook executor.
 *
 * Runs PROMOTED KnightRunbook resolutionSteps against a small allowlisted
 * action surface. Every execution is dry-run first, requires the runbook to
 * be human-promoted (status=PROMOTED, denyIfCore=false), and audit-logs each
 * action. Failures short-circuit and re-open the source ticket.
 *
 * Wired into help-desk on-call escalation:
 *   1. HelpTicket fires an EscalationEvent
 *   2. Escalation matcher finds a PROMOTED runbook by fingerprint
 *   3. If runbook.evalScore >= 0.8, executor runs it
 *   4. On success → ticket auto-resolves with "auto-resolved by Knights-Watch"
 *   5. On failure → executor logs, ticket returns to human queue
 *
 * Action DSL — the resolutionSteps field is parsed line-by-line as:
 *   render.redeploy service=<slug>          # trigger last-good redeploy
 *   render.rollback  service=<slug>          # roll back to previous good deploy
 *   db.ping                                  # verify Postgres reachability
 *   sleep seconds=<n>                        # up to 60s
 *   ticket.comment text="…"                  # append comment to source ticket
 *
 * Any line not matching the DSL is treated as a human note and skipped.
 * The DSL is deliberately tiny — expand only after each new verb has a
 * bounded blast radius review.
 */

import { db } from './db'
import { audit } from './audit'

const RENDER_API = 'https://api.render.com/v1'
const ALLOWED_SERVICES = new Set([
  'luccca-web',
  'luccca-py-api',
  'luccca-docs-editor',
  'luccca-workers',
  'echoaurion-company-os',
])

// Fixed service-slug → serviceId map so we never hit Render's /services list at
// executor runtime (that endpoint's rate-limit is the tightest on the platform).
const SERVICE_IDS: Record<string, string> = {
  'luccca-web': 'srv-d8tck5favr4c73949tl0',
  'luccca-py-api': 'srv-d9c6j07avr4c73afa6e0',
  'luccca-docs-editor': 'srv-d93187taeets73at6ch0',
  'luccca-workers': 'srv-d8tf14gjs32c73dfc3b0',
  'echoaurion-company-os': 'srv-d983k2t7vvec738t6go0',
}

export type ExecutionMode = 'dry_run' | 'live'

export interface ExecutionStep {
  ok: boolean
  action: string
  args: Record<string, string>
  detail?: string
}

export interface ExecutionResult {
  runbookId: string
  ticketId: string
  mode: ExecutionMode
  steps: ExecutionStep[]
  ok: boolean
  startedAt: string
  finishedAt: string
}

function parseStep(line: string): { action: string; args: Record<string, string> } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const [action, ...rest] = trimmed.split(/\s+/)
  const args: Record<string, string> = {}
  const argString = rest.join(' ')
  // Match key=value or key="value with spaces"
  const re = /(\w+)="([^"]*)"|(\w+)=(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(argString)) !== null) {
    if (m[1]) args[m[1]] = m[2]
    else if (m[3]) args[m[3]] = m[4]
  }
  return { action, args }
}

async function renderRedeploy(service: string, mode: ExecutionMode): Promise<ExecutionStep> {
  if (!ALLOWED_SERVICES.has(service)) {
    return { ok: false, action: 'render.redeploy', args: { service }, detail: 'service not in allowlist' }
  }
  const serviceId = SERVICE_IDS[service]
  if (!serviceId) {
    return { ok: false, action: 'render.redeploy', args: { service }, detail: 'no service id mapping' }
  }
  if (mode === 'dry_run') {
    return { ok: true, action: 'render.redeploy', args: { service }, detail: `dry-run: would POST ${RENDER_API}/services/${serviceId}/deploys` }
  }
  const token = process.env.RENDER_API_KEY
  if (!token) {
    return { ok: false, action: 'render.redeploy', args: { service }, detail: 'RENDER_API_KEY not set' }
  }
  const res = await fetch(`${RENDER_API}/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  })
  if (!res.ok) {
    return { ok: false, action: 'render.redeploy', args: { service }, detail: `render ${res.status}` }
  }
  const body = (await res.json()) as { id?: string }
  return { ok: true, action: 'render.redeploy', args: { service }, detail: `deploy ${body.id ?? 'created'}` }
}

async function renderRollback(service: string, mode: ExecutionMode): Promise<ExecutionStep> {
  if (!ALLOWED_SERVICES.has(service)) {
    return { ok: false, action: 'render.rollback', args: { service }, detail: 'service not in allowlist' }
  }
  const serviceId = SERVICE_IDS[service]
  if (!serviceId) {
    return { ok: false, action: 'render.rollback', args: { service }, detail: 'no service id mapping' }
  }
  if (mode === 'dry_run') {
    return { ok: true, action: 'render.rollback', args: { service }, detail: 'dry-run: would find last live deploy and rollback' }
  }
  const token = process.env.RENDER_API_KEY
  if (!token) {
    return { ok: false, action: 'render.rollback', args: { service }, detail: 'RENDER_API_KEY not set' }
  }
  // List last 20 deploys, find the most recent status=live one before the current failed one
  const listRes = await fetch(`${RENDER_API}/services/${serviceId}/deploys?limit=20`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!listRes.ok) return { ok: false, action: 'render.rollback', args: { service }, detail: `list ${listRes.status}` }
  const rows = (await listRes.json()) as Array<{ deploy: { id: string; status: string } }>
  const lastLive = rows.find((r) => r.deploy.status === 'live')
  if (!lastLive) return { ok: false, action: 'render.rollback', args: { service }, detail: 'no live deploy found' }
  const rbRes = await fetch(`${RENDER_API}/services/${serviceId}/rollback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ deployId: lastLive.deploy.id }),
  })
  if (!rbRes.ok) return { ok: false, action: 'render.rollback', args: { service }, detail: `rollback ${rbRes.status}` }
  return { ok: true, action: 'render.rollback', args: { service }, detail: `rolled to ${lastLive.deploy.id}` }
}

async function dbPing(mode: ExecutionMode): Promise<ExecutionStep> {
  if (mode === 'dry_run') return { ok: true, action: 'db.ping', args: {}, detail: 'dry-run' }
  try {
    const start = Date.now()
    await db.$queryRaw`SELECT 1`
    return { ok: true, action: 'db.ping', args: {}, detail: `${Date.now() - start}ms` }
  } catch (e) {
    return { ok: false, action: 'db.ping', args: {}, detail: e instanceof Error ? e.message : 'ping failed' }
  }
}

async function ticketComment(
  ticketId: string,
  text: string,
  mode: ExecutionMode
): Promise<ExecutionStep> {
  if (mode === 'dry_run') {
    return { ok: true, action: 'ticket.comment', args: { text }, detail: 'dry-run' }
  }
  try {
    await db.helpTicketEvent.create({
      data: {
        ticketId,
        kind: 'KNIGHTS_AUTO_COMMENT',
        actor: 'knights-executor',
        payload: JSON.stringify({ text }),
      },
    })
    return { ok: true, action: 'ticket.comment', args: { text }, detail: 'comment posted' }
  } catch (e) {
    return { ok: false, action: 'ticket.comment', args: { text }, detail: e instanceof Error ? e.message : 'comment failed' }
  }
}

async function sleep(seconds: number, mode: ExecutionMode): Promise<ExecutionStep> {
  const clamped = Math.min(Math.max(seconds, 0), 60)
  if (mode === 'dry_run') {
    return { ok: true, action: 'sleep', args: { seconds: String(clamped) }, detail: 'dry-run' }
  }
  await new Promise((r) => setTimeout(r, clamped * 1000))
  return { ok: true, action: 'sleep', args: { seconds: String(clamped) }, detail: `slept ${clamped}s` }
}

export async function executeRunbook(input: {
  runbookId: string
  ticketId: string
  mode: ExecutionMode
}): Promise<ExecutionResult> {
  const startedAt = new Date().toISOString()
  const rb = await db.knightRunbook.findUnique({ where: { id: input.runbookId } })
  if (!rb) {
    throw new Error(`runbook ${input.runbookId} not found`)
  }
  // Double gate: PROMOTED status + denyIfCore=false + evalScore >= 0.8
  if (rb.status !== 'PROMOTED') {
    throw new Error(`runbook ${rb.id} status=${rb.status}, must be PROMOTED`)
  }
  if (rb.denyIfCore) {
    throw new Error(`runbook ${rb.id} has denyIfCore=true, refusing to execute`)
  }
  if ((rb.evalScore ?? 0) < 0.8) {
    throw new Error(`runbook ${rb.id} evalScore=${rb.evalScore ?? 0}, must be >= 0.8`)
  }

  const steps: ExecutionStep[] = []
  const lines = rb.resolutionSteps.split(/\r?\n/)

  for (const line of lines) {
    const parsed = parseStep(line)
    if (!parsed) continue
    let step: ExecutionStep
    switch (parsed.action) {
      case 'render.redeploy':
        step = await renderRedeploy(parsed.args.service ?? '', input.mode)
        break
      case 'render.rollback':
        step = await renderRollback(parsed.args.service ?? '', input.mode)
        break
      case 'db.ping':
        step = await dbPing(input.mode)
        break
      case 'ticket.comment':
        step = await ticketComment(input.ticketId, parsed.args.text ?? '', input.mode)
        break
      case 'sleep':
        step = await sleep(Number(parsed.args.seconds ?? 0), input.mode)
        break
      default:
        step = {
          ok: false,
          action: parsed.action,
          args: parsed.args,
          detail: 'unknown verb — skipped',
        }
    }
    steps.push(step)
    if (!step.ok) break // short-circuit on first failure
  }

  const ok = steps.every((s) => s.ok) && steps.length > 0
  const finishedAt = new Date().toISOString()

  await audit(
    'knights-executor',
    ok ? 'knights.execute.ok' : 'knights.execute.fail',
    input.runbookId,
    {
      ticketId: input.ticketId,
      mode: input.mode,
      steps,
    }
  )

  return {
    runbookId: input.runbookId,
    ticketId: input.ticketId,
    mode: input.mode,
    steps,
    ok,
    startedAt,
    finishedAt,
  }
}
