import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { classifySupportRequest } from '@/lib/support-policy'
import { publishAnswerReady } from '@/lib/relay-outbox'
import { raiseAlert } from '@/lib/alerts'
import { dispatch } from '@/lib/board-room/connectors'
import { MAESTRO, knightConfigured } from '@/lib/board-room/knights'
import { isPayrollStandbyBlocked } from '@/lib/payroll-refuse'
import {
  envEchoAutoApprove,
  envHelpDeskAutoApprove,
  envHelpDeskAutoSendTech,
} from '@/lib/help-desk-auto-flags'
import { GREETING_AUTO_REPLY, isSimpleGreeting } from '@/lib/help-desk-greetings'
import { isEchoAiTicket } from '@/lib/echo-ticket-priority'
import { afterApproveDeliverLive } from '@/lib/live-repair-delivery'
import { sanitizeCustomerFacingAnswer } from '@/lib/help-desk-customer-copy'
import { buildCustomerThreadMeta } from '@/lib/customer-thread-meta'
import { closeReasonForApprove } from '@/lib/fix-disposition'

/** Customer-facing ack when Echo TECH needs a code change (BUILD stays locked). */
const ECHO_CODE_CHANGE_ACK =
  'Repair in progress — try again when the fix is live. A code change was flagged (draft only; nothing merges automatically).'

/** Soft ack when core-path dual-control blocks sending the draft body. */
const ECHO_CORE_REVIEW_ACK =
  'Repair in progress — try again when live. This ticket needs human core review (dual control); Echo was notified silently.'

/** Soft ack when Maestro flags code change under HELP_DESK_AUTO_APPROVE dev fast-path. */
const DEV_CODE_CHANGE_CUSTOMER_ACK =
  'Thanks for flagging this — our team is reviewing it and will follow up when the update is live. No action needed on your side right now.'

/** Default timed permit — env override; bootstrap extends through end of August 2026. */
export function defaultHelpDeskAutoSendUntil(): Date {
  const raw =
    process.env.HELP_DESK_AUTO_SEND_UNTIL?.trim() || '2026-08-31T23:59:59.999Z'
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? new Date('2026-08-31T23:59:59.999Z') : d
}

/**
 * Durable permit: when HELP_DESK_AUTO_SEND_UNTIL is set (or default Aug 31 2026),
 * upsert standby_settings so William does not re-click Unlock in Help Desk.
 */
async function ensureDefaultAutoSendPermit(): Promise<void> {
  try {
    const targetUntil = defaultHelpDeskAutoSendUntil()
    if (targetUntil.getTime() <= Date.now()) return

    const row = await db.standbySettings.findUnique({ where: { id: 'default' } })
    if (
      row?.helpDeskAutoSendEnabled &&
      row.helpDeskAutoSendUntil &&
      isHelpDeskAutoSendActive(row) &&
      row.helpDeskAutoSendUntil.getTime() >= targetUntil.getTime()
    ) {
      return
    }

    await db.standbySettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        mode: row?.mode ?? envMode(),
        maxAutoPerHour: row?.maxAutoPerHour ?? envMaxAuto(),
        helpDeskAutoSendEnabled: true,
        helpDeskAutoSendUntil: targetUntil,
        updatedBy: 'computer_agent',
      },
      update: {
        helpDeskAutoSendEnabled: true,
        helpDeskAutoSendUntil: targetUntil,
        updatedBy: 'computer_agent',
      },
    })
    await audit('computer_agent', 'help_desk.auto_send.bootstrap', 'default', {
      until: targetUntil.toISOString(),
      previousUntil: row?.helpDeskAutoSendUntil?.toISOString() ?? null,
    })
  } catch {
    // migrate / race — non-fatal
  }
}

/** Legacy standby modes + elite autonomy dial strings (stored in same column). */
export type StandbyMode =
  'off' | 'draft_only' | 'auto_answer_low_risk' | 'assist' | 'standby' | 'autopilot'

export const STANDBY_MODES: StandbyMode[] = [
  'off',
  'draft_only',
  'auto_answer_low_risk',
  'assist',
  'standby',
  'autopilot',
]

/** Modes that may auto-answer low-risk TEXT. */
export function modeAllowsAutoAnswer(mode: string): boolean {
  return mode === 'auto_answer_low_risk' || mode === 'standby' || mode === 'autopilot'
}

export interface StandbyConfig {
  mode: StandbyMode
  maxAutoPerHour: number
  source: 'db' | 'env' | 'default'
  updatedAt: string | null
  updatedBy: string | null
  /** Operator toggle — may be true while expired; prefer autoSendActive. */
  helpDeskAutoSendEnabled: boolean
  helpDeskAutoSendUntil: string | null
  /** True when enabled and until is in the future — dual-control unlocked for low-risk TEXT. */
  autoSendActive: boolean
}

/** True when the timed Help Desk auto-send permit is currently valid. */
export function isHelpDeskAutoSendActive(input: {
  helpDeskAutoSendEnabled: boolean
  helpDeskAutoSendUntil: Date | string | null | undefined
  now?: Date
}): boolean {
  if (!input.helpDeskAutoSendEnabled || !input.helpDeskAutoSendUntil) return false
  const until =
    input.helpDeskAutoSendUntil instanceof Date
      ? input.helpDeskAutoSendUntil
      : new Date(input.helpDeskAutoSendUntil)
  if (Number.isNaN(until.getTime())) return false
  return until.getTime() > (input.now ?? new Date()).getTime()
}

const CODE_CHANGE_SIGNAL =
  /\b(needs? code change|requires? code|hand to architect|architect seat|open a pr|pull request|deploy(ment)?|schema change|migration|implement(ation)?|refactor|ship a (fix|feature))\b/i

function envMode(): StandbyMode {
  const autonomy = (process.env.AUTONOMY_DIAL ?? '').trim().toLowerCase()
  if (autonomy === 'assist' || autonomy === 'standby' || autonomy === 'autopilot') {
    return autonomy
  }
  const raw = (process.env.KNIGHTS_STANDBY_MODE ?? 'off').trim().toLowerCase()
  if (
    raw === 'draft_only' ||
    raw === 'auto_answer_low_risk' ||
    raw === 'off' ||
    raw === 'assist' ||
    raw === 'standby' ||
    raw === 'autopilot'
  ) {
    return raw as StandbyMode
  }
  return 'off'
}

function envMaxAuto(): number {
  const n = Number(process.env.STANDBY_MAX_AUTO_PER_HOUR ?? '60')
  if (!Number.isFinite(n) || n < 0) return 60
  return Math.floor(n)
}

/** Per-clientKey hourly cap — prevents one property from consuming the global standby budget. */
function envMaxAutoPerClient(): number {
  const n = Number(process.env.STANDBY_MAX_AUTO_PER_CLIENT_PER_HOUR ?? '8')
  if (!Number.isFinite(n) || n < 0) return 8
  return Math.floor(n)
}

function emptyAutoSend(): Pick<
  StandbyConfig,
  'helpDeskAutoSendEnabled' | 'helpDeskAutoSendUntil' | 'autoSendActive'
> {
  return {
    helpDeskAutoSendEnabled: false,
    helpDeskAutoSendUntil: null,
    autoSendActive: false,
  }
}

function mapAutoSend(row: {
  helpDeskAutoSendEnabled: boolean
  helpDeskAutoSendUntil: Date | null
}): Pick<StandbyConfig, 'helpDeskAutoSendEnabled' | 'helpDeskAutoSendUntil' | 'autoSendActive'> {
  const active = isHelpDeskAutoSendActive({
    helpDeskAutoSendEnabled: row.helpDeskAutoSendEnabled,
    helpDeskAutoSendUntil: row.helpDeskAutoSendUntil,
  })
  return {
    helpDeskAutoSendEnabled: row.helpDeskAutoSendEnabled,
    helpDeskAutoSendUntil: row.helpDeskAutoSendUntil?.toISOString() ?? null,
    autoSendActive: active,
  }
}

/**
 * Lazy-clear expired permit so UI shows Locked without a manual toggle.
 * Best-effort — never throws into callers.
 */
async function clearExpiredAutoSendPermit(): Promise<void> {
  try {
    const row = await db.standbySettings.findUnique({ where: { id: 'default' } })
    if (!row?.helpDeskAutoSendEnabled || !row.helpDeskAutoSendUntil) return
    if (isHelpDeskAutoSendActive(row)) return
    await db.standbySettings.update({
      where: { id: 'default' },
      data: {
        helpDeskAutoSendEnabled: false,
        helpDeskAutoSendUntil: null,
        updatedBy: 'computer_agent',
      },
    })
    await audit('computer_agent', 'help_desk.auto_send.expire', 'default', {
      previousUntil: row.helpDeskAutoSendUntil.toISOString(),
    })
  } catch {
    // ignore — migrate/race
  }
}

export async function getStandbyConfig(): Promise<StandbyConfig> {
  try {
    await clearExpiredAutoSendPermit()
    await ensureDefaultAutoSendPermit()
    const row = await db.standbySettings.findUnique({ where: { id: 'default' } })
    if (row) {
      const mode = STANDBY_MODES.includes(row.mode as StandbyMode)
        ? (row.mode as StandbyMode)
        : envMode()
      return {
        mode,
        maxAutoPerHour: row.maxAutoPerHour,
        source: 'db',
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy,
        ...mapAutoSend(row),
      }
    }
  } catch {
    // table may not exist yet during migrate — fall through to env
  }
  const mode = envMode()
  return {
    mode,
    maxAutoPerHour: envMaxAuto(),
    source: mode === 'off' && !process.env.KNIGHTS_STANDBY_MODE ? 'default' : 'env',
    updatedAt: null,
    updatedBy: null,
    ...emptyAutoSend(),
  }
}

export async function setStandbyConfig(input: {
  mode: StandbyMode
  maxAutoPerHour?: number
  updatedBy: string
}): Promise<StandbyConfig> {
  const maxAutoPerHour = input.maxAutoPerHour ?? envMaxAuto()
  const row = await db.standbySettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      mode: input.mode,
      maxAutoPerHour,
      updatedBy: input.updatedBy,
    },
    update: {
      mode: input.mode,
      maxAutoPerHour,
      updatedBy: input.updatedBy,
    },
  })
  await audit('william_morrison', 'standby.settings.update', row.id, {
    mode: row.mode,
    maxAutoPerHour: row.maxAutoPerHour,
  })
  return {
    mode: row.mode as StandbyMode,
    maxAutoPerHour: row.maxAutoPerHour,
    source: 'db',
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    ...mapAutoSend(row),
  }
}

/**
 * Enable / extend / disable the timed Help Desk auto-send permit.
 * Does not permanently change standby mode — when active, low-risk TEXT
 * uses the same maybeStandbyAutoApprove path as auto_answer_low_risk.
 */
export async function setHelpDeskAutoSendPermit(input: {
  enabled: boolean
  until?: Date | null
  updatedBy: 'william_morrison' | 'computer_agent'
}): Promise<StandbyConfig> {
  const existing = await db.standbySettings.findUnique({ where: { id: 'default' } })
  const wasActive = existing
    ? isHelpDeskAutoSendActive({
        helpDeskAutoSendEnabled: existing.helpDeskAutoSendEnabled,
        helpDeskAutoSendUntil: existing.helpDeskAutoSendUntil,
      })
    : false

  if (input.enabled) {
    if (!input.until || Number.isNaN(input.until.getTime())) {
      throw new Error('helpDeskAutoSendUntil is required when enabling the permit')
    }
    if (input.until.getTime() <= Date.now()) {
      throw new Error('helpDeskAutoSendUntil must be in the future')
    }
  }

  const nextEnabled = input.enabled
  const nextUntil = input.enabled ? input.until! : null

  const row = await db.standbySettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      mode: envMode(),
      maxAutoPerHour: envMaxAuto(),
      helpDeskAutoSendEnabled: nextEnabled,
      helpDeskAutoSendUntil: nextUntil,
      updatedBy: input.updatedBy,
    },
    update: {
      helpDeskAutoSendEnabled: nextEnabled,
      helpDeskAutoSendUntil: nextUntil,
      updatedBy: input.updatedBy,
    },
  })

  let action: string
  if (!nextEnabled) {
    action = 'help_desk.auto_send.disable'
  } else if (wasActive) {
    action = 'help_desk.auto_send.extend'
  } else {
    action = 'help_desk.auto_send.enable'
  }

  await audit(input.updatedBy, action, row.id, {
    enabled: nextEnabled,
    until: nextUntil?.toISOString() ?? null,
    previousUntil: existing?.helpDeskAutoSendUntil?.toISOString() ?? null,
  })

  return {
    mode: (STANDBY_MODES.includes(row.mode as StandbyMode) ? row.mode : envMode()) as StandbyMode,
    maxAutoPerHour: row.maxAutoPerHour,
    source: 'db',
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    ...mapAutoSend(row),
  }
}

export interface StandbyEligibility {
  eligible: boolean
  reason: string
  forceAwaitingHuman: boolean
}

/**
 * Accuracy safeguards for Knights standby auto-answer.
 * NEVER auto-executes WorkRequest / FEATURE / code changes.
 */
export function evaluateStandbyEligibility(input: {
  channel: string
  subject: string
  knightBodies: Array<{ seat: string | null; body: string }>
  hasMaestroSynthesis: boolean
  policyKind?: 'QUESTION' | 'FIX' | 'ADDON'
}): StandbyEligibility {
  if (input.channel !== 'TEXT') {
    return {
      eligible: false,
      reason: `Channel ${input.channel} is not auto-eligible (TEXT how-to/triage only)`,
      forceAwaitingHuman: true,
    }
  }

  const policy = classifySupportRequest({
    kind: input.policyKind ?? 'QUESTION',
    title: input.subject,
    detail: input.knightBodies.map((k) => k.body).join('\n'),
  })

  if (policy.recommendation === 'QUOTE_REQUIRED') {
    return {
      eligible: false,
      reason: 'Policy QUOTE_REQUIRED — never auto-approve',
      forceAwaitingHuman: true,
    }
  }

  if (policy.recommendation === 'COMPLIMENTARY_FIX') {
    return {
      eligible: false,
      reason: 'Complimentary fix may need code — never auto-approve; William must decide',
      forceAwaitingHuman: true,
    }
  }

  const respondedSeats = new Set(
    input.knightBodies.map((k) => k.seat).filter((s): s is string => !!s)
  )
  if (respondedSeats.size < 2 && input.knightBodies.length < 2) {
    return {
      eligible: false,
      reason: 'Need ≥2 knight seats RESPONDED before standby auto-answer',
      forceAwaitingHuman: false,
    }
  }

  if (!input.hasMaestroSynthesis) {
    return {
      eligible: false,
      reason: 'Maestro synthesis required before standby auto-answer',
      forceAwaitingHuman: false,
    }
  }

  const combined = input.knightBodies.map((k) => k.body).join('\n')
  if (CODE_CHANGE_SIGNAL.test(combined) || CODE_CHANGE_SIGNAL.test(input.subject)) {
    return {
      eligible: false,
      reason: 'Architect/code-change signal detected — force AWAITING_HUMAN',
      forceAwaitingHuman: true,
    }
  }

  // Belt-and-suspenders: payroll/compensation never auto-sends.
  if (isPayrollStandbyBlocked(input.subject, [combined])) {
    return {
      eligible: false,
      reason: 'Payroll / compensation topic — never standby auto-approve',
      forceAwaitingHuman: true,
    }
  }

  if (policy.recommendation !== 'FREE_ANSWER') {
    return {
      eligible: false,
      reason: `Policy ${policy.recommendation} is not auto-eligible`,
      forceAwaitingHuman: true,
    }
  }

  return {
    eligible: true,
    reason:
      'TEXT how-to/triage · FREE_ANSWER · ≥2 knights · Maestro synthesis · no code-change signal',
    forceAwaitingHuman: false,
  }
}

async function countAutoThisHour(): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000)
  return db.customerQuestion.count({
    where: {
      standbyApproved: true,
      answeredAt: { gte: since },
    },
  })
}

async function countAutoThisHourForClient(clientKey: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000)
  return db.customerQuestion.count({
    where: {
      clientKey,
      standbyApproved: true,
      answeredAt: { gte: since },
    },
  })
}

async function standbyRateLimitExceeded(input: {
  clientKey: string | null
  maxGlobal: number
}): Promise<{ exceeded: boolean; reason?: string }> {
  const globalCount = await countAutoThisHour()
  if (globalCount >= input.maxGlobal) {
    return {
      exceeded: true,
      reason: `Rate limit STANDBY_MAX_AUTO_PER_HOUR=${input.maxGlobal}`,
    }
  }
  if (input.clientKey) {
    const perClientMax = envMaxAutoPerClient()
    const clientCount = await countAutoThisHourForClient(input.clientKey)
    if (clientCount >= perClientMax) {
      return {
        exceeded: true,
        reason: `Rate limit STANDBY_MAX_AUTO_PER_CLIENT_PER_HOUR=${perClientMax}`,
      }
    }
  }
  return { exceeded: false }
}

/**
 * Echo AI silent-radio delivery: ADMIN note + answer_ready (silent) + echo_repair_ready.
 * When resolveTicket=false (code-change / core review), leave AWAITING_APPROVAL for William.
 */
async function deliverEchoAiAutoProgress(input: {
  ticketId: string
  ticket: {
    subject: string
    clientKey: string | null
    customerQuestionId: string | null
    moduleHint: string | null
    intakeChannel: string | null
  }
  answer: string
  systemNote: string
  resolveTicket: boolean
  auditAction: string
  auditExtra?: Record<string, unknown>
}): Promise<{ autoApproved: true; reason: string }> {
  const { ticketId, ticket, answer, systemNote, resolveTicket, auditAction, auditExtra } = input

  await db.helpMessage.create({
    data: {
      ticketId,
      role: 'ADMIN',
      body: answer,
      seat: 'standby',
    },
  })
  await db.helpMessage.create({
    data: {
      ticketId,
      role: 'SYSTEM',
      body: systemNote,
    },
  })

  let questionId = ticket.customerQuestionId
  let deliveredClientKey: string | null = ticket.clientKey
  let deliveredQuestion = ticket.subject
  let deliveredDirective: unknown = null
  let deliveredContext: unknown = null
  let deliveredUserId: string | null = null

  if (questionId) {
    const q = await db.customerQuestion.update({
      where: { id: questionId },
      data: {
        answer,
        status: 'ANSWERED',
        answeredAt: new Date(),
        standbyApproved: true,
        actor: 'computer_agent',
      },
    })
    const ctx =
      q.context && typeof q.context === 'object' && !Array.isArray(q.context)
        ? (q.context as Record<string, unknown>)
        : null
    deliveredUserId = typeof ctx?.userId === 'string' ? ctx.userId : null
    deliveredClientKey = q.clientKey
    deliveredQuestion = q.question
    deliveredDirective = q.directive
    deliveredContext = q.context
    await publishAnswerReady({
      clientKey: q.clientKey,
      questionId: q.id,
      question: q.question,
      answer,
      directive: undefined,
      standbyApproved: true,
      echoSilent: true,
      ticketId,
      userId: deliveredUserId,
      panelId:
        typeof ctx?.panelId === 'string'
          ? ctx.panelId
          : typeof ctx?.moduleHint === 'string'
            ? ctx.moduleHint
            : null,
      failedStep: typeof ctx?.failedStep === 'string' ? ctx.failedStep : null,
    })
  } else if (ticket.clientKey) {
    const created = await db.customerQuestion.create({
      data: {
        clientKey: ticket.clientKey,
        question: ticket.subject,
        answer,
        status: 'ANSWERED',
        answeredAt: new Date(),
        standbyApproved: true,
        actor: 'computer_agent',
        draftAnswer: answer,
        draftSeat: 'standby',
      },
    })
    questionId = created.id
    deliveredClientKey = created.clientKey
    deliveredQuestion = created.question
    await db.helpTicket.update({
      where: { id: ticketId },
      data: { customerQuestionId: created.id },
    })
    await publishAnswerReady({
      clientKey: created.clientKey,
      questionId: created.id,
      question: created.question,
      answer,
      standbyApproved: true,
      echoSilent: true,
      ticketId,
    })
  }

  if (deliveredClientKey && questionId) {
    const live = await afterApproveDeliverLive({
      clientKey: deliveredClientKey,
      ticketId,
      questionId,
      question: deliveredQuestion,
      answer,
      directive: deliveredDirective,
      moduleHint: ticket.moduleHint,
      intakeChannel: ticket.intakeChannel,
      echoAi: true,
      context: deliveredContext,
      answerReadyPublished: true,
    })
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: live.echoRepairReady
          ? 'Silent radio: echo_repair_ready pushed to Echo only (ECHO_AUTO_APPROVE).'
          : 'Echo ECHO_AUTO_APPROVE progress complete.',
      },
    })
  }

  if (resolveTicket) {
    await db.helpTicket.update({
      where: { id: ticketId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    })
  } else {
    await db.helpTicket.update({
      where: { id: ticketId },
      data: { status: 'AWAITING_APPROVAL' },
    })
  }

  await audit('computer_agent', auditAction, ticketId, {
    subject: ticket.subject,
    resolveTicket,
    ...auditExtra,
  })

  return {
    autoApproved: true,
    reason: resolveTicket
      ? 'Echo AI auto-approved & sent (ECHO_AUTO_APPROVE)'
      : 'Echo AI auto-acked (code/core path left for William; echo_repair_ready sent)',
  }
}

/**
 * After Knights draft a TEXT ticket, optionally auto-approve a low-risk answer.
 * Work / FEATURE / execute paths are never touched here.
 * Echo AI tickets: when ECHO_AUTO_APPROVE (default true), auto-send after draft
 * and always emit echo_repair_ready. BUILD / payroll disclose / core merge stay locked.
 */
export async function maybeStandbyAutoApprove(ticketId: string): Promise<{
  autoApproved: boolean
  reason: string
}> {
  const config = await getStandbyConfig()
  const modeOk = modeAllowsAutoAnswer(config.mode)
  const permitOk = config.autoSendActive
  const techEnvOk = envHelpDeskAutoSendTech()
  const echoAutoEnv = envEchoAutoApprove()
  const helpDeskAutoApprove = envHelpDeskAutoApprove()

  const ticket = await db.helpTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) return { autoApproved: false, reason: 'Ticket not found' }
  if (ticket.channel === 'FEATURE') {
    return {
      autoApproved: false,
      reason: 'FEATURE / WorkRequest never auto-executed or auto-approved in standby',
    }
  }
  // BUILD / BILLING never auto-send — even with timed unlock, env, or standby mode.
  if (ticket.intakeGate === 'BUILD' || ticket.intakeGate === 'BILLING') {
    return {
      autoApproved: false,
      reason: `${ticket.intakeGate} gate never auto-sends — Approve & send required`,
    }
  }

  const gate = ticket.intakeGate
  const techOtherGate = gate == null || gate === 'TECH' || gate === 'OTHER'
  const envUnlock = techEnvOk && techOtherGate && ticket.channel === 'TEXT'
  /** Dev fast-path — all TEXT TECH/OTHER, not Echo-only. Core review still blocked below. */
  const devAutoUnlock = helpDeskAutoApprove && techOtherGate && ticket.channel === 'TEXT'

  const customerBodies = ticket.messages.filter((m) => m.role === 'CUSTOMER').map((m) => m.body)
  const greetingText = [ticket.subject, ...customerBodies].find((t) => isSimpleGreeting(t))
  const isGreeting = ticket.channel === 'TEXT' && techOtherGate && Boolean(greetingText)

  // Normal path requires AWAITING_APPROVAL. Greetings may still be OPEN if Knights skipped.
  if (ticket.status !== 'AWAITING_APPROVAL') {
    const greetingOpen = isGreeting && (ticket.status === 'OPEN' || ticket.status === 'WAITING')
    if (!greetingOpen) {
      return { autoApproved: false, reason: `Ticket status is ${ticket.status}` }
    }
  }

  // Simple greetings (hi / how are you / are you active): auto-send even when
  // standby/permit locked. BUILD stays locked above. Knights may still have drafted.
  if (isGreeting) {
    const knightDraft =
      ticket.messages
        .filter((m) => m.role === 'KNIGHT')
        .map((m) => m.body.trim())
        .find((b) => b.length > 0) ?? null
    const answer = sanitizeCustomerFacingAnswer((knightDraft || GREETING_AUTO_REPLY).trim())
    if (!answer) {
      return { autoApproved: false, reason: 'Greeting draft empty after sanitize' }
    }

    const rate = await standbyRateLimitExceeded({
      clientKey: ticket.clientKey,
      maxGlobal: config.maxAutoPerHour,
    })
    if (rate.exceeded) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: `Greeting auto-send rate-limited (${config.maxAutoPerHour}/hour global). Left AWAITING_APPROVAL.`,
        },
      })
      return {
        autoApproved: false,
        reason: rate.reason ?? `Rate limit STANDBY_MAX_AUTO_PER_HOUR=${config.maxAutoPerHour}`,
      }
    }

    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'ADMIN',
        body: answer,
        seat: 'standby',
      },
    })
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: knightDraft
          ? 'Greeting auto-sent (draft present) — Knights watching. BUILD stays locked.'
          : 'Greeting auto-sent (generated friendly reply) — Knights watching. BUILD stays locked.',
      },
    })

    const greetingEcho = isEchoAiTicket({
      intakeChannel: ticket.intakeChannel,
      moduleHint: ticket.moduleHint,
      priority: ticket.priority,
    })

    let questionId = ticket.customerQuestionId
    let greetingClientKey: string | null = ticket.clientKey
    if (questionId) {
      const q = await db.customerQuestion.update({
        where: { id: questionId },
        data: {
          answer,
          status: 'ANSWERED',
          answeredAt: new Date(),
          standbyApproved: true,
          actor: 'computer_agent',
        },
      })
      greetingClientKey = q.clientKey
      await publishAnswerReady({
        clientKey: q.clientKey,
        questionId: q.id,
        question: q.question,
        answer,
        directive: greetingEcho ? undefined : q.directive,
        standbyApproved: true,
        echoSilent: greetingEcho,
        ticketId,
      })
    } else if (ticket.clientKey) {
      const created = await db.customerQuestion.create({
        data: {
          clientKey: ticket.clientKey,
          question: ticket.subject,
          answer,
          status: 'ANSWERED',
          answeredAt: new Date(),
          standbyApproved: true,
          actor: 'computer_agent',
          draftAnswer: answer,
          draftSeat: 'standby',
        },
      })
      questionId = created.id
      greetingClientKey = created.clientKey
      await db.helpTicket.update({
        where: { id: ticketId },
        data: { customerQuestionId: created.id },
      })
      await publishAnswerReady({
        clientKey: created.clientKey,
        questionId: created.id,
        question: created.question,
        answer,
        standbyApproved: true,
        echoSilent: greetingEcho,
        ticketId,
      })
    }

    await db.helpTicket.update({
      where: { id: ticketId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    })

    // Echo silent radio: greetings still push echo_repair_ready when Echo-captured.
    if (greetingEcho && greetingClientKey && questionId) {
      const live = await afterApproveDeliverLive({
        clientKey: greetingClientKey,
        ticketId,
        questionId,
        question: ticket.subject,
        answer,
        moduleHint: ticket.moduleHint,
        intakeChannel: ticket.intakeChannel,
        echoAi: true,
        answerReadyPublished: true,
      })
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: live.echoRepairReady
            ? 'Silent radio: echo_repair_ready pushed to Echo only (greeting auto-send).'
            : 'Echo greeting auto-send complete.',
        },
      })
    }

    await audit('computer_agent', 'standby.greeting.auto_answer', ticketId, {
      subject: ticket.subject,
      usedDraft: Boolean(knightDraft),
      intakeGate: ticket.intakeGate,
      echoAi: greetingEcho,
    })

    return {
      autoApproved: true,
      reason: knightDraft
        ? 'Greeting auto-sent from existing draft'
        : 'Greeting auto-sent with generated friendly reply',
    }
  }

  const echoAi = isEchoAiTicket({
    intakeChannel: ticket.intakeChannel,
    moduleHint: ticket.moduleHint,
    priority: ticket.priority,
  })
  /** Testing default: ECHO_AUTO_APPROVE unlocks Echo silent-radio without standby permit. */
  const echoAuto = echoAi && echoAutoEnv && techOtherGate && ticket.channel === 'TEXT'
  /** Echo TECH may progress under standby unlock levers OR ECHO_AUTO_APPROVE. */
  const echoUnlock =
    echoAi &&
    techOtherGate &&
    ticket.channel === 'TEXT' &&
    (modeOk || permitOk || envUnlock || echoAuto)

  if (!modeOk && !permitOk && !envUnlock && !echoAuto && !devAutoUnlock) {
    return {
      autoApproved: false,
      reason: config.helpDeskAutoSendEnabled
        ? `Standby mode is ${config.mode} and auto-send permit expired`
        : `Standby/autonomy mode is ${config.mode} (auto-send locked — approve required; set HELP_DESK_AUTO_APPROVE=true, HELP_DESK_AUTO_SEND_TECH=true, ECHO_AUTO_APPROVE=true for Echo, or unlock permit for TECH/OTHER)`,
    }
  }

  // Core-path dual-control: never send the draft body via dev fast-path either.
  if (ticket.needsHumanCoreReview && !echoAuto) {
    return {
      autoApproved: false,
      reason:
        'NEEDS_HUMAN_CORE_REVIEW — dual control required (HELP_DESK_AUTO_APPROVE does not bypass core merge review)',
    }
  }

  // Core-path dual-control: never send the draft body; Echo still gets silent ack.
  if (echoAuto && ticket.needsHumanCoreReview) {
    return deliverEchoAiAutoProgress({
      ticketId,
      ticket,
      answer: ECHO_CORE_REVIEW_ACK,
      systemNote:
        'ECHO_AUTO_APPROVE — NEEDS_HUMAN_CORE_REVIEW. Draft body not sent. echo_repair_ready pushed; William dual-control required before any merge.',
      resolveTicket: false,
      auditAction: 'standby.echo.auto_ack_core_review',
      auditExtra: { needsHumanCoreReview: true },
    })
  }

  // Timed unlock / env unlock are TECH/OTHER only (null gate = OTHER-adjacent triage).
  if ((permitOk || envUnlock) && !modeOk) {
    if (!techOtherGate) {
      return {
        autoApproved: false,
        reason: `Auto-send permit / HELP_DESK_AUTO_SEND_TECH does not cover gate ${gate}`,
      }
    }
  }

  const knightMsgs = ticket.messages.filter((m) => m.role === 'KNIGHT')
  const seats = new Set(knightMsgs.map((m) => m.seat).filter((s): s is string => !!s))
  const knightBodies: Array<{ seat: string | null; body: string }> = knightMsgs.map((m) => ({
    seat: m.seat,
    body: m.body,
  }))

  // Ensure Maestro synthesis exists (or produce one now if Maestro is configured).
  let maestroBody =
    knightBodies.find((k) => (k.seat ?? '').toLowerCase() === 'maestro')?.body ?? null
  if (!maestroBody && knightConfigured(MAESTRO) && seats.size >= 2) {
    const synthesisPrompt = [
      'Synthesize a single clear customer-facing how-to / triage answer from these knight drafts.',
      'If any knight says a code change, deploy, or Architect handoff is required, reply exactly: NEEDS_CODE_CHANGE',
      echoAi
        ? 'This is an Echo AI silent-radio TECH ticket — prefer a short floor-safe triage if no code change is required.'
        : '',
      `Ticket: ${ticket.subject}`,
      '',
      ...knightBodies.map((k) => `[${k.seat ?? 'knight'}]\n${k.body}`),
    ]
      .filter(Boolean)
      .join('\n\n')
    const maestroResult = await dispatch(
      MAESTRO,
      {
        system:
          'You are Maestro synthesizing Help Desk knight drafts for a hospitality support answer. Be concise and floor-ready.',
        user: synthesisPrompt,
      },
      { clientKey: ticket.clientKey, feature: 'standby' }
    )
    if (maestroResult.status === 'RESPONDED' && maestroResult.content) {
      maestroBody = maestroResult.content
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'KNIGHT',
          seat: 'maestro',
          body: maestroBody,
        },
      })
      knightBodies.push({ seat: 'maestro', body: maestroBody })
    }
  }

  const eligibility = evaluateStandbyEligibility({
    channel: ticket.channel,
    subject: ticket.subject,
    knightBodies,
    hasMaestroSynthesis: !!maestroBody,
    policyKind: 'QUESTION',
  })

  let codeChangePending = false

  if (maestroBody && /NEEDS_CODE_CHANGE/i.test(maestroBody)) {
    codeChangePending = true
    if (echoAuto) {
      // Auto-ack Echo; leave ticket for William / Architect draft PR path. No BUILD merge.
      return deliverEchoAiAutoProgress({
        ticketId,
        ticket,
        answer: ECHO_CODE_CHANGE_ACK,
        systemNote:
          'ECHO_AUTO_APPROVE — Maestro NEEDS_CODE_CHANGE. Echo auto-acked (echo_repair_ready). BUILD locked; draft PR / Approve after fix ships. No auto-merge.',
        resolveTicket: false,
        auditAction: 'standby.echo.auto_ack_code_change',
        auditExtra: { needsCodeChange: true },
      })
    }
    if (devAutoUnlock) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: 'HELP_DESK_AUTO_APPROVE — Maestro NEEDS_CODE_CHANGE. Sending sanitized knight draft or triage ack. BUILD/core merge stays locked.',
        },
      })
      maestroBody = null
    } else {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: echoAi
            ? 'Echo TECH — Maestro flagged NEEDS_CODE_CHANGE. Left AWAITING_APPROVAL for William (BUILD/code stays locked; Approve after fix ships to push echo_repair_ready).'
            : 'Standby blocked — Maestro flagged NEEDS_CODE_CHANGE. Left AWAITING_APPROVAL for William.',
        },
      })
      return {
        autoApproved: false,
        reason: 'Maestro says needs code change — force AWAITING_HUMAN',
      }
    }
  }

  const combinedDrafts = knightBodies.map((k) => k.body).join('\n')
  const hasCodeSignal =
    CODE_CHANGE_SIGNAL.test(combinedDrafts) || CODE_CHANGE_SIGNAL.test(ticket.subject)
  if (hasCodeSignal) codeChangePending = true
  if (echoAuto && hasCodeSignal) {
    return deliverEchoAiAutoProgress({
      ticketId,
      ticket,
      answer: ECHO_CODE_CHANGE_ACK,
      systemNote:
        'ECHO_AUTO_APPROVE — code-change signal in drafts. Echo auto-acked (echo_repair_ready). BUILD locked; no auto-merge.',
      resolveTicket: false,
      auditAction: 'standby.echo.auto_ack_code_change',
      auditExtra: { needsCodeChange: true, viaSignal: true },
    })
  }
  if (hasCodeSignal && !echoAuto && !devAutoUnlock) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: 'Standby blocked — Architect/code-change signal detected. Left AWAITING_APPROVAL for William (HELP_DESK_AUTO_APPROVE does not bypass code-change).',
      },
    })
    return {
      autoApproved: false,
      reason: 'Architect/code-change signal detected — force AWAITING_HUMAN',
    }
  }

  const echoSoftOk = echoUnlock && knightBodies.length > 0 && !hasCodeSignal

  /** Policy-seat payroll refuse is safe to auto-send (refuse text, not figures). */
  const policyRefuseOnly =
    knightBodies.length > 0 && knightBodies.every((k) => (k.seat ?? '').toLowerCase() === 'policy')

  /** ECHO_AUTO_APPROVE: send any soft TEXT / refuse draft (not code/core/BUILD). */
  const echoForceSend =
    echoAuto &&
    knightBodies.length > 0 &&
    !hasCodeSignal &&
    (!isPayrollStandbyBlocked(ticket.subject, [combinedDrafts]) || policyRefuseOnly)

  /** HELP_DESK_AUTO_APPROVE: TEXT TECH/OTHER — sends clean reply; BUILD/core merge stay locked. */
  const devForceSend =
    devAutoUnlock &&
    knightBodies.length > 0 &&
    !ticket.needsHumanCoreReview &&
    (!isPayrollStandbyBlocked(ticket.subject, [combinedDrafts]) || policyRefuseOnly)

  if (!eligibility.eligible && !echoSoftOk && !echoForceSend && !devForceSend) {
    if (eligibility.forceAwaitingHuman) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: `Standby blocked — ${eligibility.reason}. Left AWAITING_APPROVAL for William.`,
        },
      })
    }
    return { autoApproved: false, reason: eligibility.reason }
  }

  if (!eligibility.eligible && (echoSoftOk || echoForceSend || devForceSend)) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: devForceSend
          ? 'HELP_DESK_AUTO_APPROVE — dev fast-path auto-send. Approve & send only (no merge/deploy). Set false for dual-control.'
          : echoForceSend
            ? 'ECHO_AUTO_APPROVE — Echo AI ticket auto-send (soft/TEXT/refuse). BUILD stays locked.'
            : 'Echo-priority TECH — soft progress under auto-send unlock (no code-change signal). BUILD stays locked.',
      },
    })
  }

  let answerSource = maestroBody ?? knightBodies[knightBodies.length - 1]?.body
  if (devForceSend && (!answerSource?.trim() || /NEEDS_CODE_CHANGE/i.test(answerSource))) {
    answerSource =
      knightBodies
        .filter((k) => k.body?.trim() && !/NEEDS_CODE_CHANGE/i.test(k.body))
        .slice(-1)[0]?.body ?? DEV_CODE_CHANGE_CUSTOMER_ACK
  }
  if (!answerSource?.trim()) {
    return { autoApproved: false, reason: 'No knight draft body to auto-approve' }
  }

  // Dev / Echo testing fast-paths bypass the hourly standby cap so queues clear.
  if (!devForceSend && !echoForceSend && !echoAuto) {
    const rate = await standbyRateLimitExceeded({
      clientKey: ticket.clientKey,
      maxGlobal: config.maxAutoPerHour,
    })
    if (rate.exceeded) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: `Standby rate limit reached (${config.maxAutoPerHour}/hour global · ${envMaxAutoPerClient()}/hour per client). Left for William.`,
        },
      })
      return {
        autoApproved: false,
        reason: rate.reason ?? `Rate limit STANDBY_MAX_AUTO_PER_HOUR=${config.maxAutoPerHour}`,
      }
    }
  }

  const answer = sanitizeCustomerFacingAnswer(answerSource.trim())
  if (!answer) {
    return { autoApproved: false, reason: 'Knight draft empty after customer-copy sanitize' }
  }
  const draftSnapshot = {
    ticketId,
    subject: ticket.subject,
    channel: ticket.channel,
    intakeGate: ticket.intakeGate,
    seats: [...seats, ...(maestroBody ? ['maestro'] : [])],
    knightDrafts: knightBodies,
    approvedAnswer: answer,
    mode: config.mode,
    viaAutoSendPermit: permitOk && !modeOk,
    viaTechEnv: envUnlock && !modeOk && !permitOk,
    viaHelpDeskAutoApprove: Boolean(devForceSend),
    helpDeskAutoSendUntil: config.helpDeskAutoSendUntil,
  }

  await db.helpMessage.create({
    data: {
      ticketId,
      role: 'ADMIN',
      body: answer,
      seat: 'standby',
    },
  })
  const unlockNote =
    devForceSend && !modeOk && !permitOk && !envUnlock && !echoAuto
      ? 'HELP_DESK_AUTO_APPROVE — ticket auto-sent (dev fast-path). BUILD/core merge stays locked. Set HELP_DESK_AUTO_APPROVE=false for dual-control.'
      : echoAuto && !modeOk && !permitOk && !envUnlock
        ? 'ECHO_AUTO_APPROVE — Echo AI ticket auto-sent. echo_repair_ready will follow. BUILD stays locked. Set ECHO_AUTO_APPROVE=false for dual-control.'
        : envUnlock && !modeOk && !permitOk
          ? 'HELP_DESK_AUTO_SEND_TECH approved low-risk TECH/OTHER TEXT — review queue. BUILD stays locked. William should audit later.'
          : permitOk && !modeOk
            ? `Auto-send permit approved — review queue. Unlocked until ${config.helpDeskAutoSendUntil ?? 'n/a'}. William should audit later.`
            : 'Standby approved — review queue. Knights auto-answered under accuracy safeguards. William should audit later.'
  await db.helpMessage.create({
    data: {
      ticketId,
      role: 'SYSTEM',
      body: unlockNote,
    },
  })

  let questionId = ticket.customerQuestionId
  let deliveredClientKey: string | null = null
  let deliveredQuestion: string = ticket.subject
  let deliveredDirective: unknown = null
  let deliveredContext: unknown = null
  let deliveredUserId: string | null = null

  const disposition = codeChangePending
    ? ('reply_sent_code_pending' as const)
    : closeReasonForApprove({
        answer,
        subject: ticket.subject,
        needsHumanCoreReview: ticket.needsHumanCoreReview,
        messageBodies: knightBodies.map((k) => k.body),
      })
  const threadMeta = buildCustomerThreadMeta({
    intakeGate: ticket.intakeGate ?? null,
    questionStatus: 'ANSWERED',
    replyState: 'replied',
    closeReason: disposition,
    answer,
    subject: ticket.subject,
    needsHumanCoreReview: ticket.needsHumanCoreReview,
    ticketStatus: 'RESOLVED',
    messageBodies: knightBodies.map((k) => k.body),
  })

  if (questionId) {
    const q = await db.customerQuestion.update({
      where: { id: questionId },
      data: {
        answer,
        status: 'ANSWERED',
        answeredAt: new Date(),
        standbyApproved: true,
        actor: 'computer_agent',
      },
    })
    const ctx =
      q.context && typeof q.context === 'object' && !Array.isArray(q.context)
        ? (q.context as Record<string, unknown>)
        : null
    deliveredUserId = typeof ctx?.userId === 'string' ? ctx.userId : null
    deliveredClientKey = q.clientKey
    deliveredQuestion = q.question
    deliveredDirective = q.directive
    deliveredContext = q.context
    await publishAnswerReady({
      clientKey: q.clientKey,
      questionId: q.id,
      question: q.question,
      answer,
      directive: echoAi ? undefined : q.directive,
      standbyApproved: true,
      echoSilent: echoAi,
      ticketId,
      userId: deliveredUserId,
      panelId:
        typeof ctx?.panelId === 'string'
          ? ctx.panelId
          : typeof ctx?.moduleHint === 'string'
            ? ctx.moduleHint
            : null,
      failedStep: typeof ctx?.failedStep === 'string' ? ctx.failedStep : null,
      closeReason: threadMeta.closeReason,
      disposition: threadMeta.disposition,
      fixSha: threadMeta.fixSha,
      etaLabel: threadMeta.etaLabel,
      intakeGate: ticket.intakeGate ?? null,
    })
  } else if (ticket.clientKey) {
    const created = await db.customerQuestion.create({
      data: {
        clientKey: ticket.clientKey,
        question: ticket.subject,
        answer,
        status: 'ANSWERED',
        answeredAt: new Date(),
        standbyApproved: true,
        actor: 'computer_agent',
        draftAnswer: answer,
        draftSeat: 'maestro',
      },
    })
    questionId = created.id
    deliveredClientKey = created.clientKey
    deliveredQuestion = created.question
    await db.helpTicket.update({
      where: { id: ticketId },
      data: { customerQuestionId: created.id },
    })
    await publishAnswerReady({
      clientKey: created.clientKey,
      questionId: created.id,
      question: created.question,
      answer,
      standbyApproved: true,
      echoSilent: echoAi,
      ticketId,
      closeReason: threadMeta.closeReason,
      disposition: threadMeta.disposition,
      fixSha: threadMeta.fixSha,
      etaLabel: threadMeta.etaLabel,
      intakeGate: ticket.intakeGate ?? null,
    })
  }

  // Echo silent radio: auto-approve must push echo_repair_ready (Approve path does this;
  // previously standby skipped it and tickets looked "filed but never fixed").
  if (echoAi && deliveredClientKey && questionId) {
    const live = await afterApproveDeliverLive({
      clientKey: deliveredClientKey,
      ticketId,
      questionId,
      question: deliveredQuestion,
      answer,
      directive: deliveredDirective,
      moduleHint: ticket.moduleHint,
      intakeChannel: ticket.intakeChannel,
      echoAi: true,
      context: deliveredContext,
      answerReadyPublished: true,
    })
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: live.echoRepairReady
          ? 'Silent radio: echo_repair_ready pushed to Echo only (standby auto-progress).'
          : 'Echo standby auto-progress complete.',
      },
    })
  }

  await db.helpMessage.create({
    data: {
      ticketId,
      role: 'SYSTEM',
      body:
        disposition === 'reply_sent_code_pending'
          ? 'Disposition: reply sent · code not deployed. Auto-approve pushes chat/echo_repair_ready only — merge Architect draft PR onto laughing-noether for UI fixes.'
          : disposition === 'resolved_fix'
            ? 'Disposition: marked as product fix — verify commit is on the luccca-web deploy branch before treating as done.'
            : 'Disposition: how-to / config reply (no code deploy expected).',
    },
  })

  await db.helpTicket.update({
    where: { id: ticketId },
    data: { status: 'RESOLVED', resolvedAt: new Date(), closeReason: disposition },
  })

  await audit('computer_agent', 'standby.question.auto_answer', ticketId, {
    ...draftSnapshot,
    echoAi,
    echoAuto,
    helpDeskAutoApprove,
    devForceSend: devForceSend && !eligibility.eligible,
    echoSoftProgress: (echoSoftOk || echoForceSend) && !eligibility.eligible,
    autoApproveNote: devForceSend
      ? 'HELP_DESK_AUTO_APPROVE dev fast-path'
      : echoAuto
        ? 'ECHO_AUTO_APPROVE'
        : undefined,
    closeReason: disposition,
    codeChangePending,
  })

  await raiseAlert({
    kind: 'question',
    severity: 'INFO',
    title: echoAi
      ? echoAuto
        ? 'Echo AI auto-sent (ECHO_AUTO_APPROVE) — review queue'
        : 'Echo TECH auto-progressed — review queue'
      : 'Standby approved — review queue',
    body: ticket.subject.slice(0, 140),
    entityRef: ticketId,
    url: '/support/pilot-links',
  })

  return {
    autoApproved: true,
    reason:
      devForceSend && !echoAuto
        ? 'Help Desk auto-approved & sent (HELP_DESK_AUTO_APPROVE)'
        : echoAuto
          ? 'Echo AI auto-approved & sent (ECHO_AUTO_APPROVE)'
          : echoAi
            ? 'Echo-priority TECH auto-progressed under unlock / low-risk safeguards'
            : 'Auto-answered under standby safeguards',
  }
}

/** Work requests: standby may only draft + suggest quote — never execute. */
export function standbyMayExecuteWork(): false {
  return false
}
