import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { classifySupportRequest } from '@/lib/support-policy'
import { publishAnswerReady } from '@/lib/relay-outbox'
import { raiseAlert } from '@/lib/alerts'
import { dispatch } from '@/lib/board-room/connectors'
import { MAESTRO, knightConfigured } from '@/lib/board-room/knights'

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

export async function getStandbyConfig(): Promise<StandbyConfig> {
  try {
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
  if (!modeAllowsAutoAnswer(config.mode)) {
    return { autoApproved: false, reason: `Standby/autonomy mode is ${config.mode}` }
  }

  const ticket = await db.helpTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) return { autoApproved: false, reason: 'Ticket not found' }
  if (ticket.status !== 'AWAITING_APPROVAL') {
    return { autoApproved: false, reason: `Ticket status is ${ticket.status}` }
  }
  if (ticket.channel === 'FEATURE') {
    return {
      autoApproved: false,
      reason: 'FEATURE / WorkRequest never auto-executed or auto-approved in standby',
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
      `Ticket: ${ticket.subject}`,
      '',
      ...knightBodies.map((k) => `[${k.seat ?? 'knight'}]\n${k.body}`),
    ].join('\n\n')
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
        body: 'Standby blocked — Maestro flagged NEEDS_CODE_CHANGE. Left AWAITING_APPROVAL for William.',
      },
    })
    return {
      autoApproved: false,
      reason: 'Maestro says needs code change — force AWAITING_HUMAN',
    }
  }

  if (!eligibility.eligible) {
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
    seats: [...seats, ...(maestroBody ? ['maestro'] : [])],
    knightDrafts: knightBodies,
    approvedAnswer: answer,
    mode: config.mode,
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
      body: 'Standby approved — review queue. Knights auto-answered under accuracy safeguards. William should audit later.',
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
        draftSeat: 'maestro',
      },
    })
    questionId = created.id
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

  await audit('computer_agent', 'standby.question.auto_answer', ticketId, draftSnapshot)

  await raiseAlert({
    kind: 'question',
    severity: 'INFO',
    title: 'Standby approved — review queue',
    body: ticket.subject.slice(0, 140),
    entityRef: ticketId,
    url: '/support/pilot-links',
  })

  return { autoApproved: true, reason: 'Auto-answered under standby safeguards' }
}

/** Work requests: standby may only draft + suggest quote — never execute. */
export function standbyMayExecuteWork(): false {
  return false
}
