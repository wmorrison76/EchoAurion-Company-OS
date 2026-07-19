import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { classifySupportRequest } from '@/lib/support-policy'
import { publishAnswerReady } from '@/lib/relay-outbox'
import { raiseAlert } from '@/lib/alerts'
import { dispatch } from '@/lib/board-room/connectors'
import { MAESTRO, knightConfigured } from '@/lib/board-room/knights'
import { isPayrollStandbyBlocked } from '@/lib/payroll-refuse'
import { envHelpDeskAutoSendTech } from '@/lib/help-desk-auto-flags'
import { GREETING_AUTO_REPLY, isSimpleGreeting } from '@/lib/help-desk-greetings'
import { isEchoAiTicket } from '@/lib/echo-ticket-priority'
import { afterApproveDeliverLive } from '@/lib/live-repair-delivery'

/** Legacy standby modes + elite autonomy dial strings (stored in same column). */
export type StandbyMode =
  | 'off'
  | 'draft_only'
  | 'auto_answer_low_risk'
  | 'assist'
  | 'standby'
  | 'autopilot'

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
  const n = Number(process.env.STANDBY_MAX_AUTO_PER_HOUR ?? '10')
  if (!Number.isFinite(n) || n < 0) return 10
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
}): Pick<
  StandbyConfig,
  'helpDeskAutoSendEnabled' | 'helpDeskAutoSendUntil' | 'autoSendActive'
> {
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
    mode: (STANDBY_MODES.includes(row.mode as StandbyMode)
      ? row.mode
      : envMode()) as StandbyMode,
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
    reason: 'TEXT how-to/triage · FREE_ANSWER · ≥2 knights · Maestro synthesis · no code-change signal',
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

/**
 * After Knights draft a TEXT ticket, optionally auto-approve a low-risk answer.
 * Work / FEATURE / execute paths are never touched here.
 */
export async function maybeStandbyAutoApprove(ticketId: string): Promise<{
  autoApproved: boolean
  reason: string
}> {
  const config = await getStandbyConfig()
  const modeOk = modeAllowsAutoAnswer(config.mode)
  const permitOk = config.autoSendActive
  const techEnvOk = envHelpDeskAutoSendTech()

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

  const customerBodies = ticket.messages
    .filter((m) => m.role === 'CUSTOMER')
    .map((m) => m.body)
  const greetingText = [ticket.subject, ...customerBodies].find((t) => isSimpleGreeting(t))
  const isGreeting =
    ticket.channel === 'TEXT' && techOtherGate && Boolean(greetingText)

  // Normal path requires AWAITING_APPROVAL. Greetings may still be OPEN if Knights skipped.
  if (ticket.status !== 'AWAITING_APPROVAL') {
    const greetingOpen =
      isGreeting && (ticket.status === 'OPEN' || ticket.status === 'WAITING')
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
    const answer = (knightDraft || GREETING_AUTO_REPLY).trim()

    const autoCount = await countAutoThisHour()
    if (autoCount >= config.maxAutoPerHour) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: `Greeting auto-send rate-limited (${config.maxAutoPerHour}/hour). Left AWAITING_APPROVAL.`,
        },
      })
      return {
        autoApproved: false,
        reason: `Rate limit STANDBY_MAX_AUTO_PER_HOUR=${config.maxAutoPerHour}`,
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

    let questionId = ticket.customerQuestionId
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
      await publishAnswerReady({
        clientKey: q.clientKey,
        questionId: q.id,
        question: q.question,
        answer,
        directive: q.directive,
        standbyApproved: true,
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
      })
    }

    await db.helpTicket.update({
      where: { id: ticketId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    })

    await audit('computer_agent', 'standby.greeting.auto_answer', ticketId, {
      subject: ticket.subject,
      usedDraft: Boolean(knightDraft),
      intakeGate: ticket.intakeGate,
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
  /** Echo TECH may progress under the same unlock levers as low-risk TEXT. */
  const echoUnlock =
    echoAi && techOtherGate && ticket.channel === 'TEXT' && (modeOk || permitOk || envUnlock)

  if (!modeOk && !permitOk && !envUnlock) {
    return {
      autoApproved: false,
      reason: config.helpDeskAutoSendEnabled
        ? `Standby mode is ${config.mode} and auto-send permit expired`
        : `Standby/autonomy mode is ${config.mode} (auto-send locked — approve required; set HELP_DESK_AUTO_SEND_TECH=true or unlock permit for TECH/OTHER)`,
    }
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
    const maestroResult = await dispatch(MAESTRO, {
      system:
        'You are Maestro synthesizing Help Desk knight drafts for a hospitality support answer. Be concise and floor-ready.',
      user: synthesisPrompt,
    })
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

  if (maestroBody && /NEEDS_CODE_CHANGE/i.test(maestroBody)) {
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

  const combinedDrafts = knightBodies.map((k) => k.body).join('\n')
  const echoSoftOk =
    echoUnlock &&
    knightBodies.length > 0 &&
    !CODE_CHANGE_SIGNAL.test(combinedDrafts) &&
    !CODE_CHANGE_SIGNAL.test(ticket.subject)

  if (!eligibility.eligible && !echoSoftOk) {
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

  if (!eligibility.eligible && echoSoftOk) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: 'Echo-priority TECH — soft progress under auto-send unlock (no code-change signal). BUILD stays locked.',
      },
    })
  }

  const answerSource = maestroBody ?? knightBodies[knightBodies.length - 1]?.body
  if (!answerSource?.trim()) {
    return { autoApproved: false, reason: 'No knight draft body to auto-approve' }
  }

  const autoCount = await countAutoThisHour()
  if (autoCount >= config.maxAutoPerHour) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: `Standby rate limit: ${config.maxAutoPerHour}/hour reached. Left for William.`,
      },
    })
    return {
      autoApproved: false,
      reason: `Rate limit STANDBY_MAX_AUTO_PER_HOUR=${config.maxAutoPerHour}`,
    }
  }

  const answer = answerSource.trim()
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
    envUnlock && !modeOk && !permitOk
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

  await db.helpTicket.update({
    where: { id: ticketId },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  })

  await audit('computer_agent', 'standby.question.auto_answer', ticketId, {
    ...draftSnapshot,
    echoAi,
    echoSoftProgress: echoSoftOk && !eligibility.eligible,
  })

  await raiseAlert({
    kind: 'question',
    severity: 'INFO',
    title: echoAi
      ? 'Echo TECH auto-progressed — review queue'
      : 'Standby approved — review queue',
    body: ticket.subject.slice(0, 140),
    entityRef: ticketId,
    url: '/support/pilot-links',
  })

  return {
    autoApproved: true,
    reason: echoAi
      ? 'Echo-priority TECH auto-progressed under unlock / low-risk safeguards'
      : 'Auto-answered under standby safeguards',
  }
}

/** Work requests: standby may only draft + suggest quote — never execute. */
export function standbyMayExecuteWork(): false {
  return false
}
