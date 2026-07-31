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
import { detectPayrollRefuse } from '@/lib/payroll-refuse'
import {
  attachmentPromptBlock,
  loadAttachmentsForTicket,
} from '@/lib/help-desk-attachments'
import { isSimpleGreeting } from '@/lib/help-desk-greetings'
import {
  envEchoAutoApprove,
  envHelpDeskAutoApprove,
  shouldAutoKnightsOnQuestion,
} from '@/lib/help-desk-auto-flags'
import { isEchoAiTicket } from '@/lib/echo-ticket-priority'
import type { Seat } from '@/types/board-room'
import type { HelpTicketDetail } from '@/types/help-desk'
import { withKnightSlot } from '@/lib/knight-concurrency'

export { shouldAutoKnightsOnQuestion } from '@/lib/help-desk-auto-flags'

const EXTRA_SEATS: Seat[] = ['strategist', 'analyst', 'scout']

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
  return withKnightSlot(() => dispatchKnightsOnTicketInner(ticketId, opts))
}

async function dispatchKnightsOnTicketInner(
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

  // Multilingual + payroll gate need CustomerQuestion.context before convene.
  let questionContext: unknown = undefined
  let questionText: string | undefined
  if (ticket.customerQuestionId) {
    const cq = await db.customerQuestion.findUnique({
      where: { id: ticket.customerQuestionId },
      select: { context: true, question: true },
    })
    questionContext = cq?.context ?? undefined
    questionText = cq?.question
  }
  const customerText =
    ticket.messages.find((m) => m.role === 'CUSTOMER')?.body ??
    questionText ??
    ticket.subject

  const payrollGate = detectPayrollRefuse({
    text: customerText,
    subject: ticket.subject,
    context: questionContext,
    operatorOverride: actor === 'william_morrison',
  })
  if (payrollGate.refuse) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: payrollGate.operatorNote,
      },
    })
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'KNIGHT',
        seat: 'policy',
        body: payrollGate.customerReply,
      },
    })
    if (ticket.customerQuestionId) {
      await db.customerQuestion.update({
        where: { id: ticket.customerQuestionId },
        data: {
          draftAnswer: payrollGate.customerReply,
          draftSeat: 'policy',
          status: 'DRAFTED',
        },
      })
    }
    const refused = await db.helpTicket.update({
      where: { id: ticketId },
      data: {
        status: 'AWAITING_APPROVAL',
        agentWorking: false,
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })
    await audit(actor, 'help_desk.knights.payroll_refuse', ticketId, {
      reason: payrollGate.reason,
      matched: payrollGate.matched,
    })

    // Echo AI testing + dev fast-path: auto-send the safe refuse text (never invents pay figures).
    const mayAutoSendRefuse =
      envHelpDeskAutoApprove() ||
      (isEchoAiTicket({
        intakeChannel: refused.intakeChannel,
        moduleHint: refused.moduleHint,
        priority: refused.priority,
      }) &&
        envEchoAutoApprove())
    if (mayAutoSendRefuse) {
      const standby = await maybeStandbyAutoApprove(ticketId)
      if (standby.autoApproved) {
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
            knightCount: 0,
            autoApproved: true,
            responded: ['policy'],
            skipped: [{ seat: 'all', reason: `payroll_refuse:${payrollGate.reason}` }],
            reason: standby.reason,
          }
        }
      }
    }

    return {
      ticket: toDetail(refused),
      knightCount: 0,
      autoApproved: false,
      responded: [],
      skipped: [{ seat: 'all', reason: `payroll_refuse:${payrollGate.reason}` }],
      reason: payrollGate.reason ?? 'payroll_refuse',
    }
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

  const attachmentViews = await loadAttachmentsForTicket({
    ticketId,
    customerQuestionId: ticket.customerQuestionId,
  })
  const shotsBlock = attachmentPromptBlock(
    attachmentViews.map((a) => ({
      altText: a.altText,
      mimeType: a.mimeType,
      byteSize: a.byteSize,
    }))
  )
  if (attachmentViews.length > 0) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: `📎 User attached ${attachmentViews.length} screenshot${attachmentViews.length === 1 ? '' : 's'} — open Help Desk thumbnails to review (text Knights cannot see pixels).`,
      },
    })
  }

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
    shotsBlock,
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
        const result = await dispatch(
          ROSTER[seat],
          {
            system: answerDraftSystemPrompt({ replyLanguageLabel }),
            user: prompt,
          },
          { clientKey: ticket.clientKey, feature: 'knights' }
        )
        if (result.status === 'RESPONDED' && result.content) {
          return { seat, body: result.content, status: result.status as string }
        }
        return {
          seat,
          body: null as string | null,
          status: result.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : result.status,
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
  const echoTicket = isEchoAiTicket({
    intakeChannel: updated.intakeChannel,
    moduleHint: updated.moduleHint,
    priority: updated.priority,
  })
  // Normal standby when not core-blocked; Echo + ECHO_AUTO_APPROVE may still
  // auto-ack (echo_repair_ready) without sending the core-risk draft body.
  const mayStandby =
    updated.status === 'AWAITING_APPROVAL' &&
    (!coreGuard.needsHumanCoreReview || (echoTicket && envEchoAutoApprove()))
  if (mayStandby) {
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
 * Queue TEXT knight dispatch on ingest_jobs — fast intake, worker drain.
 * Dedupe: one pending job per ticket.
 */
export async function enqueueInboundKnights(input: {
  questionId: string
  ticketId: string
}): Promise<{ jobId: string; queued: boolean }> {
  const { enqueueIngestJob } = await import('@/lib/ingest-queue')
  const result = await enqueueIngestJob({
    kind: 'text_knights',
    dedupeKey: `knights:${input.ticketId}`,
    payload: { ticketId: input.ticketId, questionId: input.questionId },
  })
  if (result.created) {
    await audit('computer_agent', 'help_desk.knights.enqueue', input.ticketId, {
      questionId: input.questionId,
      jobId: result.id,
    })
  }
  return { jobId: result.id, queued: result.created }
}

export interface InboundQuestionPrep {
  ticketId: string
  shouldRunKnights: boolean
  detail: HelpTicketDetail
}

/**
 * Sync path after relay intake: ensure HelpTicket TEXT, decide if Knights should run.
 */
export async function prepareInboundQuestion(questionId: string): Promise<InboundQuestionPrep> {
  const detail = await ensureTicketFromInbox({ kind: 'question', id: questionId })
  const ticketId = detail.id

  const gate = detail.intakeGate
  const gateBlocksKnights = gate === 'BILLING' || gate === 'BUILD'
  const techOtherOk = gate == null || gate === 'TECH' || gate === 'OTHER'
  const echoAi = isEchoAiTicket({
    intakeChannel: detail.intakeChannel,
    moduleHint: detail.moduleHint,
    priority: detail.priority,
    echoAi: detail.echoAi,
  })
  const autoKnights =
    !gateBlocksKnights && (shouldAutoKnightsOnQuestion() || (echoAi && techOtherOk))

  if (!autoKnights) {
    if (gateBlocksKnights) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body:
            gate === 'BUILD'
              ? 'BUILD gate — paid WorkAgreement path. Auto-Knights skipped; quote / agreement required. Pilot UI: no auto-reply for this category.'
              : 'BILLING gate — billing policy path. Auto-Knights skipped. Pilot UI: no auto-reply for this category.',
        },
      })
    } else if (!techOtherOk) {
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: `Gate ${gate} — Auto-Knights skipped.`,
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
    return { ticketId, shouldRunKnights: false, detail }
  }

  if (!pickDraftSeat()) {
    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'SYSTEM',
        body: 'Auto-Knights skipped — no AI seat configured. William can Ask Knights from Help Desk.',
      },
    })
    if (techOtherOk && isSimpleGreeting(detail.subject)) {
      const greeting = await maybeStandbyAutoApprove(ticketId)
      if (greeting.autoApproved) {
        return { ticketId, shouldRunKnights: false, detail }
      }
    }
    return { ticketId, shouldRunKnights: false, detail }
  }

  return { ticketId, shouldRunKnights: true, detail }
}

/**
 * Worker path: run Knights + standby on an existing ticket (after enqueue).
 */
export async function runInboundKnights(input: {
  ticketId: string
  questionId?: string
}): Promise<{ knightsRan: boolean; autoApproved: boolean }> {
  const { ticketId } = input
  try {
    const result = await dispatchKnightsOnTicket(ticketId, { actor: 'computer_agent' })
    if (!result.autoApproved) {
      const payrollRefused =
        result.reason?.startsWith('payroll') || result.reason?.includes('compensation')
      await db.helpMessage.create({
        data: {
          ticketId,
          role: 'SYSTEM',
          body: payrollRefused
            ? 'Payroll / compensation refuse draft ready — review before send. Never invent pay figures; Approve only the safe refuse text (or reply manually after verifying role).'
            : 'Draft ready — pilot is waiting. Click Approve & send (or unlock auto-send / standby low-risk TEXT) to deliver the reply to the property UI.',
        },
      })
      await raiseAlert({
        kind: 'question',
        severity: 'WARN',
        title: payrollRefused
          ? 'Payroll refuse — awaiting review'
          : 'Knights drafted — awaiting approval',
        body: result.ticket.subject.slice(0, 140),
        entityRef: ticketId,
        url: `/help-desk?ticket=${ticketId}`,
      })
    }
    return {
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
    return { knightsRan: false, autoApproved: false }
  }
}

/**
 * After relay receives a customer question: ensure HelpTicket TEXT + queue Knights job.
 * Returns immediately after enqueue — knights drain on worker cron.
 */
export async function processInboundQuestion(
  questionId: string
): Promise<{ ticketId: string; knightsRan: boolean; autoApproved: boolean; queued?: boolean }> {
  const prep = await prepareInboundQuestion(questionId)
  if (!prep.shouldRunKnights) {
    return { ticketId: prep.ticketId, knightsRan: false, autoApproved: false }
  }

  const enq = await enqueueInboundKnights({
    questionId,
    ticketId: prep.ticketId,
  })

  await db.helpMessage.create({
    data: {
      ticketId: prep.ticketId,
      role: 'SYSTEM',
      body: enq.queued
        ? 'Knights queued — drafting off the web request path. Pilot reply follows when the worker drains this ticket.'
        : 'Knights already queued for this ticket — prior job still pending.',
    },
  })

  return {
    ticketId: prep.ticketId,
    knightsRan: false,
    autoApproved: false,
    queued: enq.queued,
  }
}
