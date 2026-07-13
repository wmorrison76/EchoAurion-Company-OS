import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { draftAnswer, draftPlan, pickDraftSeat } from '@/lib/support-relay'
import { dispatch } from '@/lib/board-room/connectors'
import { ROSTER, knightConfigured, configHint } from '@/lib/board-room/knights'
import { answerDraftSystemPrompt } from '@/lib/support-voice'
import { maybeStandbyAutoApprove } from '@/lib/standby'
import { ensureTicketFromInbox, toDetail } from '@/lib/help-desk'
import { raiseAlert } from '@/lib/alerts'
import { guardCorePaths } from '@/lib/core-path-guard'
import { loadRunbookContext } from '@/lib/knight-learning'
import { sanitizeAgentThreadForTenant } from '@/lib/tenant-isolation'
import {
  multilingualPromptBlock,
  resolveHelpDeskLanguage,
  type HelpDeskLanguageResolution,
} from '@/lib/help-desk-locale'
import type { Seat } from '@/types/board-room'
import type { HelpTicketDetail } from '@/types/help-desk'

const EXTRA_SEATS: Seat[] = ['strategist', 'analyst', 'scout']

/**
 * Auto-run Knights when a new inbound question arrives.
 * Default ON (William's ask). Set AUTO_KNIGHTS_ON_QUESTION=false to disable
 * unless standby/autonomy is draft_only | assist | standby | autopilot | auto_answer_low_risk.
 */
export function shouldAutoKnightsOnQuestion(): boolean {
  const flag = (process.env.AUTO_KNIGHTS_ON_QUESTION ?? 'true').trim().toLowerCase()
  if (flag === 'true' || flag === '1' || flag === 'yes') return true
  if (flag === 'false' || flag === '0' || flag === 'no') {
    const autonomy = (process.env.AUTONOMY_DIAL ?? '').trim().toLowerCase()
    if (autonomy === 'assist' || autonomy === 'standby' || autonomy === 'autopilot') {
      return true
    }
    const standby = (process.env.KNIGHTS_STANDBY_MODE ?? 'off').trim().toLowerCase()
    return (
      standby === 'draft_only' ||
      standby === 'auto_answer_low_risk' ||
      standby === 'assist' ||
      standby === 'standby' ||
      standby === 'autopilot'
    )
  }
  return true
}

export interface KnightsDispatchResult {
  ticket: HelpTicketDetail
  knightCount: number
  autoApproved: boolean
  /** Seats that responded. */
  responded: string[]
  /** Seats skipped (billing/outage/not configured) — convene continues. */
  skipped: Array<{ seat: string; reason: string }>
  reason?: string
}

/**
 * Ask the Knights for counsel on a Help Desk ticket.
 * Partial synthesis: if Scout (or any seat) is UNAVAILABLE, remaining seats continue.
 * Appends KNIGHT messages, sets AWAITING_APPROVAL, then maybe standby auto-approve.
 */
export async function dispatchKnightsOnTicket(
  ticketId: string,
  opts?: { actor?: 'william_morrison' | 'computer_agent' }
): Promise<KnightsDispatchResult> {
  const actor = opts?.actor ?? 'william_morrison'
  const ticket = await db.helpTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) throw new Error('Ticket not found')

  if (!pickDraftSeat()) {
    throw new Error('No AI seat is configured — set knight API keys')
  }

  await db.helpTicket.update({
    where: { id: ticketId },
    data: {
      status: 'WITH_KNIGHTS',
      ...(ticket.channel === 'SYSTEM' ? { agentWorking: true } : {}),
    },
  })
  await db.helpMessage.create({
    data: {
      ticketId,
      role: 'SYSTEM',
      body:
        actor === 'computer_agent'
          ? 'Agent + Knights working — drafting automatically. Review before send unless standby auto-approves low-risk TEXT. Unavailable seats are skipped; remaining seats continue.'
          : 'Asking the Knights of the Round Table… drafts are for your review only — nothing is sent until you Approve. Unavailable seats are skipped.',
    },
  })

  const thread = sanitizeAgentThreadForTenant({
    messages: ticket.messages.map((m) => ({ role: m.role, body: m.body })),
    ticketClientKey: ticket.clientKey,
    channel: ticket.channel,
  })

  const runbookCtx = await loadRunbookContext({
    fingerprint: ticket.fingerprint,
    productLine: ticket.productLine,
    errorCategory: ticket.errorCategory,
  })

  // Multilingual: UI locale from CustomerQuestion.context + script detect on question text.
  let questionContext: unknown = undefined
  if (ticket.customerQuestionId) {
    const cq = await db.customerQuestion.findUnique({
      where: { id: ticket.customerQuestionId },
      select: { context: true, question: true },
    })
    questionContext = cq?.context ?? undefined
  }
  const customerText =
    ticket.messages.find((m) => m.role === 'CUSTOMER')?.body ?? ticket.subject
  const lang: HelpDeskLanguageResolution = resolveHelpDeskLanguage({
    text: customerText,
    context: questionContext,
  })
  const replyLanguageLabel = `${lang.replyLabel} (${lang.replyLocale})`

  await db.helpMessage.create({
    data: {
      ticketId,
      role: 'SYSTEM',
      // LTR English operator note — do not set dir=rtl here (ar/he drafts live in KNIGHT bodies).
      body: `Language: reply in ${replyLanguageLabel} · UI locale ${lang.uiLocale ?? 'unset'} · source ${lang.source}`,
    },
  })

  const prompt = [
    `Help Desk ticket: ${ticket.subject}`,
    `Channel: ${ticket.channel}`,
    ticket.clientKey ? `Tenant clientKey: ${ticket.clientKey}` : null,
    ticket.fingerprint ? `Fingerprint: ${ticket.fingerprint}` : null,
    ticket.errorScope ? `Scope: ${ticket.errorScope}` : null,
    ticket.errorCategory ? `Category: ${ticket.errorCategory}` : null,
    '',
    multilingualPromptBlock(lang),
    '',
    'Tenant isolation: do not reference other properties’ guest/staff data. Patterns only.',
    '',
    runbookCtx
      ? `## Learned runbooks (prior fixes — do NOT suggest removing auth/middleware)\n${runbookCtx}\n`
      : null,
    `Thread:\n${thread || ticket.subject}`,
  ]
    .filter(Boolean)
    .join('\n')

  const knightBodies: Array<{ seat: string | null; body: string }> = []
  const skipped: Array<{ seat: string; reason: string }> = []
  const responded: string[] = []

  if (ticket.channel === 'FEATURE') {
    const plan = await draftPlan(ticket.subject, thread || ticket.subject, 'ADDON')
    if (plan.answer) {
      knightBodies.push({ seat: plan.seat, body: plan.answer })
      if (plan.seat) responded.push(plan.seat)
    } else if (plan.error) {
      skipped.push({ seat: plan.seat ?? 'primary', reason: plan.error })
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: `Primary plan seat UNAVAILABLE (${plan.seat ?? 'n/a'}): ${plan.error} — continuing with any remaining seats.`,
        },
      })
    }
  } else {
    const primary = await draftAnswer(prompt, undefined, { replyLanguageLabel })
    if (primary.answer) {
      knightBodies.push({ seat: primary.seat, body: primary.answer })
      if (primary.seat) responded.push(primary.seat)
    } else if (primary.error) {
      skipped.push({ seat: primary.seat ?? 'primary', reason: primary.error })
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: `Primary knight UNAVAILABLE (${primary.seat ?? 'n/a'}): ${primary.error} — continuing with remaining seats (partial synthesis).`,
        },
      })
    }

    const extras = EXTRA_SEATS.filter((s) => s !== primary.seat)
    const configuredExtras = extras.filter((s) => knightConfigured(ROSTER[s])).slice(0, 2)
    for (const s of extras) {
      if (!knightConfigured(ROSTER[s])) {
        skipped.push({
          seat: s,
          reason: configHint(ROSTER[s]) ?? 'not configured / billing',
        })
      }
    }

    const extraResults = await Promise.allSettled(
      configuredExtras.map(async (seat) => {
        const result = await dispatch(ROSTER[seat], {
          system: answerDraftSystemPrompt({ replyLanguageLabel }),
          user: prompt,
        })
        if (result.status === 'RESPONDED' && result.content) {
          return { seat, body: result.content, status: result.status as string }
        }
        return {
          seat,
          body: null as string | null,
          status: result.status,
          error: result.error,
        }
      })
    )

    for (const r of extraResults) {
      if (r.status === 'fulfilled' && r.value.body) {
        knightBodies.push({ seat: r.value.seat, body: r.value.body })
        responded.push(r.value.seat)
      } else if (r.status === 'fulfilled') {
        skipped.push({
          seat: r.value.seat,
          reason: `${r.value.status}${r.value.error ? `: ${r.value.error}` : ''}`,
        })
      } else {
        skipped.push({
          seat: 'extra',
          reason: r.reason instanceof Error ? r.reason.message : 'rejected',
        })
      }
    }
  }

  if (skipped.length > 0) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: `Provider health — skipped ${skipped.length} seat(s), continued with ${knightBodies.length}: ${skipped
          .map((s) => `${s.seat} (${s.reason})`)
          .join('; ')}`,
      },
    })
  }

  for (const k of knightBodies) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'KNIGHT',
        body: k.body,
        seat: k.seat,
      },
    })
  }

  if (knightBodies.length === 0) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: 'No knight responses returned (all seats unavailable or errored). Check API keys / billing — convene did not fail the ticket; reply manually or retry.',
      },
    })
  }

  // Hallucination / core self-harm guard — scan drafts before standby.
  const coreGuard = guardCorePaths({
    planText: knightBodies.map((k) => k.body).join('\n'),
    subject: ticket.subject,
  })
  if (coreGuard.needsHumanCoreReview) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: `NEEDS_HUMAN_CORE_REVIEW — ${coreGuard.reason}\nMatched: ${coreGuard.matched.join(', ') || 'warn-list'}\nStandby auto-approve blocked. Dual control required.`,
      },
    })
  }

  // Sync primary draft onto linked CustomerQuestion when present.
  const primaryDraft = knightBodies[0]
  if (ticket.customerQuestionId && primaryDraft?.body) {
    await db.customerQuestion.update({
      where: { id: ticket.customerQuestionId },
      data: {
        draftAnswer: primaryDraft.body,
        draftSeat: primaryDraft.seat,
        status: 'DRAFTED',
      },
    })
  }

  const updated = await db.helpTicket.update({
    where: { id: ticketId },
    data: {
      status: knightBodies.length > 0 ? 'AWAITING_APPROVAL' : 'OPEN',
      ...(coreGuard.needsHumanCoreReview ? { needsHumanCoreReview: true } : {}),
      ...(ticket.channel === 'SYSTEM' && knightBodies.length > 0
        ? { agentWorking: true }
        : {}),
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      voiceNotes: { orderBy: { createdAt: 'asc' } },
      _count: { select: { messages: true } },
    },
  })

  await audit(actor, 'help_desk.knights.dispatch', ticketId, {
    seats: knightBodies.map((k) => k.seat),
    count: knightBodies.length,
    skipped,
    coreGuard: coreGuard.flag,
  })

  let autoApproved = false
  let reason: string | undefined
  if (updated.status === 'AWAITING_APPROVAL' && !coreGuard.needsHumanCoreReview) {
    const standby = await maybeStandbyAutoApprove(ticketId)
    autoApproved = standby.autoApproved
    reason = standby.reason
    if (autoApproved) {
      const refreshed = await db.helpTicket.findUnique({
        where: { id: ticketId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          voiceNotes: { orderBy: { createdAt: 'asc' } },
          _count: { select: { messages: true } },
        },
      })
      if (refreshed) {
        return {
          ticket: toDetail(refreshed),
          knightCount: knightBodies.length,
          autoApproved: true,
          responded,
          skipped,
          reason,
        }
      }
    }
  } else if (coreGuard.needsHumanCoreReview) {
    reason = 'NEEDS_HUMAN_CORE_REVIEW — standby blocked'
  }

  return {
    ticket: toDetail(updated),
    knightCount: knightBodies.length,
    autoApproved,
    responded,
    skipped,
    reason,
  }
}

/**
 * After relay receives a customer question: ensure HelpTicket TEXT + optional Knights.
 * Fire-and-forget safe — errors are logged via SYSTEM messages / alerts.
 */
export async function processInboundQuestion(
  questionId: string
): Promise<{ ticketId: string; knightsRan: boolean; autoApproved: boolean }> {
  const detail = await ensureTicketFromInbox({ kind: 'question', id: questionId })
  const ticketId = detail.id

  const gateBlocksKnights =
    detail.intakeGate === 'BILLING' || detail.intakeGate === 'BUILD'

  if (!shouldAutoKnightsOnQuestion() || gateBlocksKnights) {
    if (gateBlocksKnights) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body:
            detail.intakeGate === 'BUILD'
              ? 'BUILD gate — paid WorkAgreement path. Auto-Knights skipped; quote / agreement required.'
              : 'BILLING gate — billing policy path. Auto-Knights skipped.',
        },
      })
    }
    await raiseAlert({
      kind: 'question',
      severity: 'WARN',
      title: gateBlocksKnights
        ? `New ${detail.intakeGate} question (no auto-Knights)`
        : 'New customer question (no auto-Knights)',
      body: detail.subject.slice(0, 140),
      entityRef: ticketId,
      url: `/help-desk?ticket=${ticketId}`,
    })
    return { ticketId, knightsRan: false, autoApproved: false }
  }

  if (!pickDraftSeat()) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: 'Auto-Knights skipped — no AI seat configured. William can Ask Knights from Help Desk.',
      },
    })
    return { ticketId, knightsRan: false, autoApproved: false }
  }

  try {
    const result = await dispatchKnightsOnTicket(ticketId, { actor: 'computer_agent' })
    if (!result.autoApproved) {
      await raiseAlert({
        kind: 'question',
        severity: 'WARN',
        title: 'Knights drafted — awaiting approval',
        body: detail.subject.slice(0, 140),
        entityRef: ticketId,
        url: `/help-desk?ticket=${ticketId}`,
      })
    }
    return {
      ticketId,
      knightsRan: true,
      autoApproved: result.autoApproved,
    }
  } catch (err) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: `Auto-Knights failed: ${err instanceof Error ? err.message : 'unknown'}`,
      },
    })
    await raiseAlert({
      kind: 'question',
      severity: 'CRITICAL',
      title: 'Auto-Knights failed',
      body: err instanceof Error ? err.message.slice(0, 140) : 'unknown',
      entityRef: ticketId,
      url: `/help-desk?ticket=${ticketId}`,
    })
    return { ticketId, knightsRan: false, autoApproved: false }
  }
}
