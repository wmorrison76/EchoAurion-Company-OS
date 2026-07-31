import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { relayAuthorized, relayQuestionsThrottle, relayRateLimited, relayThrottleResponse, requireClientKey } from '@/lib/relay-auth'
import { upsertSupportClientByKey } from '@/lib/relay-heartbeat'
import {
  processInboundQuestion,
  shouldAutoKnightsOnQuestion,
} from '@/lib/help-desk-knights'
import { getStandbyConfig } from '@/lib/standby'
import { gateFromQuestionPayload, INTAKE_GATE_META } from '@/lib/intake-gate'
import { supportEtaLabel } from '@/lib/support-eta'
import { enforcePerTenantSecretIfSet } from '@/lib/tenant-ingest-secret'
import {
  attachmentAuditMeta,
  parseIncomingAttachments,
  persistAttachments,
} from '@/lib/help-desk-attachments'
import {
  parseRelayUserId,
  userIdContextEquals,
} from '@/lib/relay-question-scope'
import {
  allowEchoTicketBudget,
  echoFileWhy,
  enforceEchoClientKey,
  isEchoPanelWatchEnabled,
} from '@/lib/echo-guardrails'
import { isEchoAiContext } from '@/lib/echo-ticket-priority'
import { buildCustomerThreadMeta } from '@/lib/customer-thread-meta'
import { processRelayFollowUp } from '@/lib/relay-question-followup'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/** Customer-visible answer length — pilot thread scrolls; do not truncate aggressively. */
const PILOT_THREAD_TEXT_MAX = 16_000

/** Pilot Help Desk thread retention window (multi-device re-fetch). */
const HELP_DESK_HISTORY_DAYS = 15

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  question: z.string().min(1).max(4000),
  /** Existing thread — HelpTicket id or CustomerQuestion id (pilot thread key). */
  ticketId: z.string().min(1).max(128).optional(),
  context: z.record(z.unknown()).optional(),
  /** Pilot UI language code (en, es, ar, …) — merged into context.locale for Knights. */
  locale: z.string().min(2).max(16).optional(),
  gate: z.enum(['TECH', 'BILLING', 'BUILD', 'OTHER']).optional(),
  intakeGate: z.enum(['TECH', 'BILLING', 'BUILD', 'OTHER']).optional(),
  /** Up to 2 screenshots (PNG/JPEG/WebP), base64 — max ~1.5MB each decoded. */
  attachments: z
    .array(
      z.object({
        mimeType: z.string().min(3).max(64),
        dataBase64: z.string().min(1).max(2_200_000),
        fileName: z.string().max(200).optional(),
        altText: z.string().max(200).optional(),
        widthPx: z.number().int().positive().max(10000).optional(),
        heightPx: z.number().int().positive().max(10000).optional(),
      })
    )
    .max(2)
    .optional(),
})

interface ThreadFollowUp {
  body: string
  createdAt: string
}

interface QuestionHistoryItem {
  id: string
  /** HelpTicket id — use for same-thread Reply. */
  ticketId: string | null
  question: string
  answer: string | null
  status: string
  intakeGate: string | null
  createdAt: string
  answeredAt: string | null
  /** Waiting for reply | Replied — shape+label friendly for pilots. */
  replyState: 'waiting' | 'replied'
  closeReason: string | null
  disposition: string | null
  fixSha: string | null
  etaLabel: string | null
  /** Customer follow-ups after the first message on this thread. */
  followUps: ThreadFollowUp[]
  statusBadge: {
    shape: string
    label: string
    level: 'ok' | 'warn' | 'unknown'
  } | null
}

/** Strip emails / long digit runs from pilot-facing text (PII hygiene). */
function redactPilotText(text: string, max = PILOT_THREAD_TEXT_MAX): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{10,}\b/g, '[digits]')
    .slice(0, max)
}

/**
 * GET /api/relay/questions?clientKey=…&userId=…
 * Last 15 days of Q&A for this user on this deployment (does NOT mark delivered).
 * userId is REQUIRED — without it we return an empty list (fail-closed privacy).
 * Never returns org-wide / coworker tickets.
 */
export async function GET(req: Request): Promise<Response> {
  const a = relayAuthorized(req)
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }
  const url = new URL(req.url)
  const key = requireClientKey(url.searchParams.get('clientKey'))
  if (!key.ok) {
    return Response.json(
      { success: false, error: key.error, code: key.code },
      { status: key.status }
    )
  }
  const userId = parseRelayUserId(url.searchParams.get('userId'))

  // Fail closed: no userId → empty history (never org-wide dump).
  if (!userId) {
    return Response.json({
      success: true,
      data: [] as QuestionHistoryItem[],
      meta: {
        lastUpdated: new Date().toISOString(),
        days: HELP_DESK_HISTORY_DAYS,
        scoped: false,
        reason: 'userId_required',
      },
    })
  }

  try {
    const since = new Date(
      Date.now() - HELP_DESK_HISTORY_DAYS * 24 * 60 * 60 * 1000
    )
    const where: Prisma.CustomerQuestionWhereInput = {
      clientKey: key.clientKey,
      createdAt: { gte: since },
      status: { not: 'DISMISSED' },
      context: userIdContextEquals(userId),
    }

    const rows = await db.customerQuestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        question: true,
        answer: true,
        status: true,
        intakeGate: true,
        createdAt: true,
        answeredAt: true,
      },
    })

    const tickets = await db.helpTicket.findMany({
      where: { customerQuestionId: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        customerQuestionId: true,
        closeReason: true,
        status: true,
        subject: true,
        needsHumanCoreReview: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, body: true, createdAt: true },
        },
      },
    })
    const ticketByQuestion = new Map(
      tickets
        .filter((t) => t.customerQuestionId)
        .map((t) => [t.customerQuestionId!, t])
    )

    const data: QuestionHistoryItem[] = rows.map((r) => {
      const replied = Boolean(r.answer && r.status === 'ANSWERED')
      const replyState: QuestionHistoryItem['replyState'] = replied ? 'replied' : 'waiting'
      const ticket = ticketByQuestion.get(r.id)
      const staffBodies =
        ticket?.messages
          .filter((m) => m.role === 'KNIGHT' || m.role === 'ADMIN')
          .map((m) => m.body)
          .slice(-4) ?? []
      const customerMsgs =
        ticket?.messages.filter((m) => m.role === 'CUSTOMER') ?? []
      const followUps: ThreadFollowUp[] = customerMsgs.slice(1).map((m) => ({
        body: redactPilotText(m.body),
        createdAt: m.createdAt.toISOString(),
      }))
      const meta = buildCustomerThreadMeta({
        intakeGate: r.intakeGate ?? null,
        questionStatus: r.status,
        replyState,
        closeReason: ticket?.closeReason ?? null,
        answer: r.answer,
        subject: ticket?.subject ?? r.question,
        needsHumanCoreReview: ticket?.needsHumanCoreReview ?? null,
        ticketStatus: ticket?.status ?? null,
        messageBodies: staffBodies,
      })
      return {
        id: r.id,
        ticketId: ticket?.id ?? null,
        question: redactPilotText(
          customerMsgs[0]?.body ?? r.question
        ),
        answer: r.answer ? redactPilotText(r.answer) : null,
        status: r.status,
        intakeGate: r.intakeGate ?? null,
        createdAt: r.createdAt.toISOString(),
        answeredAt: r.answeredAt?.toISOString() ?? null,
        replyState,
        closeReason: meta.closeReason,
        disposition: meta.disposition,
        fixSha: meta.fixSha,
        etaLabel: meta.etaLabel,
        followUps,
        statusBadge: meta.statusBadge,
      }
    })

    return Response.json({
      success: true,
      data,
      meta: {
        lastUpdated: new Date().toISOString(),
        days: HELP_DESK_HISTORY_DAYS,
        scoped: true,
        userId,
      },
    } as APIResponse<QuestionHistoryItem[]> & {
      meta: {
        lastUpdated: string
        days: number
        scoped: boolean
        userId: string
      }
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'History fetch failed',
        code: 'HISTORY_FAILED',
      },
      { status: 500 }
    )
  }
}

/**
 * A deployment submits a customer question.
 * Creates CustomerQuestion + HelpTicket TEXT, then (by default) runs Knights
 * draft in the background. Standby may auto-approve low-risk TEXT only.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = relayAuthorized(req)
  if (!auth.ok) {
    return Response.json(
      { success: false, error: auth.error, code: auth.code },
      { status: auth.status }
    )
  }
  const ipLimit = relayRateLimited(req, 'questions')
  if (!ipLimit.ok) {
    return Response.json(
      { success: false, error: ipLimit.error, code: ipLimit.code },
      { status: ipLimit.status }
    )
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid question payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }
    const key = requireClientKey(parsed.data.clientKey)
    if (!key.ok) {
      return Response.json(
        { success: false, error: key.error, code: key.code },
        { status: key.status }
      )
    }

    const clientThrottle = await relayQuestionsThrottle(key.clientKey)
    if (!clientThrottle.ok && !clientThrottle.throttle.ok) {
      return relayThrottleResponse(clientThrottle.throttle)
    }

    const echoCtx = parsed.data.context ?? null
    const echoAi = isEchoAiContext(echoCtx)
    if (echoAi) {
      if (!isEchoPanelWatchEnabled()) {
        return Response.json(
          {
            success: false,
            error: 'Echo panel watch disabled (ECHO_PANEL_WATCH=off)',
            code: 'ECHO_PANEL_WATCH_OFF',
            label: '○ Echo panel watch off',
          },
          { status: 503 }
        )
      }
      const isolation = enforceEchoClientKey({
        clientKey: key.clientKey,
        context: echoCtx,
      })
      if (!isolation.ok) {
        return Response.json(
          {
            success: false,
            error: isolation.error,
            code: isolation.code,
          },
          { status: isolation.status }
        )
      }
      const budget = allowEchoTicketBudget(key.clientKey)
      if (!budget.ok) {
        return Response.json(
          {
            success: false,
            error: budget.label,
            code: budget.code,
            label: budget.label,
            retryAfterSec: budget.retryAfterSec,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(budget.retryAfterSec) },
          }
        )
      }
    }

    const tenant = await enforcePerTenantSecretIfSet({
      clientKey: key.clientKey,
      req,
      sharedOk: true,
    })
    if (!tenant.ok) {
      return Response.json(
        { success: false, error: tenant.error, code: tenant.code },
        { status: tenant.status }
      )
    }

    const { question, context, locale, attachments: rawAttachments, ticketId: followUpRef } =
      parsed.data
    let parsedAtt: ReturnType<typeof parseIncomingAttachments>
    try {
      parsedAtt = parseIncomingAttachments(rawAttachments)
    } catch (err) {
      console.error('[relay/questions] attachment parse failed', err)
      return Response.json(
        {
          success: false,
          error: 'Could not process screenshots — try one smaller capture',
          code: 'ATTACHMENT_PROCESS',
        },
        { status: 400 }
      )
    }
    if (!parsedAtt.ok) {
      return Response.json(
        { success: false, error: parsedAtt.error, code: parsedAtt.code },
        { status: 400 }
      )
    }

    const intakeGate = gateFromQuestionPayload({
      gate: parsed.data.gate,
      intakeGate: parsed.data.intakeGate,
      context: context ?? null,
    })

    // Merge top-level locale into context so Knights can resolve reply language.
    // Never store raw image bytes in context JSON — only metadata after persist.
    const mergedContext: Record<string, unknown> = {
      ...(context ?? {}),
    }
    // Strip any accidental base64 blobs from context before store.
    if ('attachments' in mergedContext) {
      delete mergedContext.attachments
    }
    if (locale?.trim()) {
      mergedContext.locale = locale.trim()
    } else if (
      typeof mergedContext.locale !== 'string' &&
      typeof mergedContext.uiLocale === 'string'
    ) {
      mergedContext.locale = mergedContext.uiLocale
    }

    const relayUserId = parseRelayUserId(
      typeof mergedContext.userId === 'string' ? mergedContext.userId : null
    )

    /** Same-thread follow-up — append to existing ticket, do not spawn a new one. */
    if (followUpRef?.trim()) {
      if (!relayUserId) {
        return Response.json(
          {
            success: false,
            error: 'userId required for thread reply',
            code: 'USER_REQUIRED',
          },
          { status: 400 }
        )
      }
      try {
        const followUp = await processRelayFollowUp({
          ticketRef: followUpRef.trim(),
          clientKey: key.clientKey,
          userId: relayUserId,
          body: question,
          context: mergedContext,
          intakeGate: intakeGate ?? null,
          attachments:
            parsedAtt.ok && parsedAtt.prepared.length > 0
              ? parsedAtt.prepared
              : undefined,
        })

        const gateMetaFollow = intakeGate ? INTAKE_GATE_META[intakeGate] : null
        const etaLabelFollow = supportEtaLabel({
          intakeGate: intakeGate ?? null,
          questionStatus: 'NEW',
          replyState: 'waiting',
        })

        return Response.json(
          {
            success: true,
            data: {
              id: followUp.questionId,
              ticketId: followUp.ticketId,
              followUp: true,
              reopened: followUp.reopened,
              autoKnights: followUp.autoKnights,
              knightsQueued: followUp.knightsQueued,
              intakeGate,
              routeHint: gateMetaFollow?.routeHint ?? null,
              waitingHint: '✓ Sent — waiting for Aurion',
              attachmentCount: parsedAtt.ok ? parsedAtt.prepared.length : 0,
              etaLabel: etaLabelFollow,
            },
          } satisfies APIResponse<{
            id: string
            ticketId: string
            followUp: boolean
            reopened: boolean
            autoKnights: boolean
            knightsQueued: boolean
            intakeGate: string | null
            routeHint: string | null
            waitingHint: string
            attachmentCount: number
            etaLabel: string | null
          }>,
          { status: 200 }
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Follow-up failed'
        if (msg === 'TICKET_NOT_FOUND') {
          return Response.json(
            { success: false, error: 'Thread not found', code: 'TICKET_NOT_FOUND' },
            { status: 404 }
          )
        }
        if (msg === 'TICKET_FORBIDDEN') {
          return Response.json(
            { success: false, error: 'Thread not found', code: 'TICKET_FORBIDDEN' },
            { status: 403 }
          )
        }
        if (msg === 'TICKET_NOT_REPLYABLE') {
          return Response.json(
            {
              success: false,
              error: 'This thread cannot accept replies',
              code: 'TICKET_NOT_REPLYABLE',
            },
            { status: 400 }
          )
        }
        throw err
      }
    }

    const client = await upsertSupportClientByKey(key.clientKey)
    const created = await db.customerQuestion.create({
      data: {
        clientKey: key.clientKey,
        clientId: client.id,
        question,
        intakeGate: intakeGate ?? undefined,
        context:
          Object.keys(mergedContext).length > 0
            ? (mergedContext as Prisma.InputJsonValue)
            : undefined,
        actor: 'computer_agent',
      },
    })

    let attachmentMetas: Awaited<ReturnType<typeof persistAttachments>> = []
    if (parsedAtt.prepared.length > 0) {
      attachmentMetas = await persistAttachments({
        customerQuestionId: created.id,
        prepared: parsedAtt.prepared,
      })
      mergedContext.attachmentMeta = attachmentMetas.map((a) => ({
        id: a.id,
        mimeType: a.mimeType,
        altText: a.altText,
        byteSize: a.byteSize,
      }))
      await db.customerQuestion.update({
        where: { id: created.id },
        data: { context: mergedContext as Prisma.InputJsonValue },
      })
    }

    const echoWhy = echoAi ? echoFileWhy(mergedContext) : null
    await audit('computer_agent', 'support.question.receive', created.id, {
      intakeGate,
      locale: typeof mergedContext.locale === 'string' ? mergedContext.locale : undefined,
      ...(attachmentMetas.length
        ? { attachments: attachmentAuditMeta(attachmentMetas) }
        : {}),
      ...(echoWhy
        ? {
            echoAi: true,
            why: echoWhy.why,
            failureKind: echoWhy.failureKind,
            panelId: echoWhy.panelId,
            silent: echoWhy.silent,
            actor: 'computer_agent',
          }
        : {}),
    })
    if (echoWhy) {
      await audit('computer_agent', 'echo.ticket.file', created.id, {
        clientKey: key.clientKey,
        why: echoWhy.why,
        failureKind: echoWhy.failureKind,
        panelId: echoWhy.panelId,
        silent: echoWhy.silent,
      })
    }

    const gateMeta = intakeGate ? INTAKE_GATE_META[intakeGate] : null
    const autoKnights =
      shouldAutoKnightsOnQuestion() && (gateMeta?.autoKnightsOk ?? true)

    const inbound = await processInboundQuestion(created.id).catch((err) => {
      console.error('[relay/questions] processInboundQuestion failed', err)
      void raiseAlert({
        kind: 'question',
        severity: 'CRITICAL',
        title: 'Inbound question processing failed',
        body: question.slice(0, 140),
        entityRef: created.id,
        url: '/help-desk',
      })
      return { ticketId: '', knightsRan: false, autoApproved: false, queued: false }
    })

    if (inbound.ticketId) {
      console.info(
        `[relay/questions] processed ${created.id} → ticket ${inbound.ticketId} queued=${inbound.queued ?? false} auto=${inbound.autoApproved} gate=${intakeGate ?? 'unset'} attachments=${attachmentMetas.length}`
      )
    }

    const alertTitle =
      intakeGate === 'BUILD'
        ? 'New BUILD request — paid path'
        : intakeGate === 'BILLING'
          ? 'New BILLING question'
          : autoKnights
            ? 'New customer question — Knights drafting'
            : 'New customer question'

    const shotNote =
      attachmentMetas.length > 0
        ? ` · ${attachmentMetas.length} screenshot${attachmentMetas.length === 1 ? '' : 's'}`
        : ''

    await raiseAlert({
      kind: 'question',
      severity: 'WARN',
      title: alertTitle,
      body: `${gateMeta ? `${gateMeta.shape} ${gateMeta.label}: ` : ''}${question.slice(0, 120)}${shotNote}`,
      entityRef: created.id,
      url: '/support/inbox',
    })

    const standby = await getStandbyConfig()
    const autoSendUnlockedUntil =
      standby.autoSendActive &&
      (intakeGate === 'TECH' || intakeGate === 'OTHER' || intakeGate == null)
        ? standby.helpDeskAutoSendUntil
        : null

    /** Pilot-facing expectation — customer-safe (no Company OS / Approve language). */
    let waitingHint: string
    const etaLabel = supportEtaLabel({
      intakeGate: intakeGate ?? null,
      questionStatus: 'NEW',
      replyState: 'waiting',
    })
    if (intakeGate === 'BUILD') {
      waitingHint = 'queued for a paid build / quote — Aurion will follow up'
    } else if (intakeGate === 'BILLING') {
      waitingHint = 'queued for billing — Aurion will follow up'
    } else if (autoSendUnlockedUntil) {
      waitingHint = '✓ Sent — waiting for Aurion'
    } else if (autoKnights) {
      waitingHint = '✓ Sent — waiting for Aurion'
    } else {
      waitingHint = '✓ Sent — Aurion will follow up'
    }

    return Response.json(
      {
        success: true,
        data: {
          id: created.id,
          autoKnights,
          knightsQueued: inbound.queued ?? false,
          intakeGate,
          routeHint: gateMeta?.routeHint ?? null,
          waitingHint,
          autoSendUnlockedUntil,
          attachmentCount: attachmentMetas.length,
          etaLabel,
        },
      } satisfies APIResponse<{
        id: string
        autoKnights: boolean
        knightsQueued: boolean
        intakeGate: string | null
        routeHint: string | null
        waitingHint: string
        autoSendUnlockedUntil: string | null
        attachmentCount: number
        etaLabel: string | null
      }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Question submit failed',
        code: 'QUESTION_FAILED',
      },
      { status: 500 }
    )
  }
}
