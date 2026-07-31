import { Prisma, type IntakeGate } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { parseRelayUserId } from '@/lib/relay-question-scope'
import {
  attachmentAuditMeta,
  parseIncomingAttachments,
  persistAttachments,
} from '@/lib/help-desk-attachments'
import type { ParseAttachmentsResult } from '@/lib/help-desk-attachments'
import {
  enqueueInboundKnights,
  shouldAutoKnightsOnQuestion,
} from '@/lib/help-desk-knights'
import { INTAKE_GATE_META } from '@/lib/intake-gate'
import { isSlaBreached } from '@/lib/support-sla'

const TERMINAL_STATUSES = new Set(['RESOLVED', 'CLOSED'])

/** Resolve HelpTicket by ticket id or linked CustomerQuestion id. */
export async function resolveTicketForFollowUp(
  id: string,
  clientKey: string
) {
  const byId = await db.helpTicket.findFirst({
    where: { id, clientKey },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (byId) return byId

  return db.helpTicket.findFirst({
    where: { customerQuestionId: id, clientKey },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })
}

function questionUserId(context: unknown): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return null
  }
  const raw = (context as Record<string, unknown>).userId
  return typeof raw === 'string' ? parseRelayUserId(raw) : null
}

export interface RelayFollowUpInput {
  /** HelpTicket id or CustomerQuestion id (pilot thread key). */
  ticketRef: string
  clientKey: string
  userId: string
  body: string
  context?: Record<string, unknown>
  intakeGate?: IntakeGate | null
  attachments?: Extract<ParseAttachmentsResult, { ok: true }>['prepared']
}

export interface RelayFollowUpResult {
  questionId: string
  ticketId: string
  reopened: boolean
  knightsQueued: boolean
  autoKnights: boolean
}

/**
 * Append a customer follow-up to an existing Help Desk thread.
 * Does NOT create a new CustomerQuestion or HelpTicket.
 */
export async function processRelayFollowUp(
  input: RelayFollowUpInput
): Promise<RelayFollowUpResult> {
  const ticket = await resolveTicketForFollowUp(input.ticketRef, input.clientKey)
  if (!ticket) {
    throw new Error('TICKET_NOT_FOUND')
  }
  if (!ticket.customerQuestionId) {
    throw new Error('TICKET_NOT_REPLYABLE')
  }

  const question = await db.customerQuestion.findUnique({
    where: { id: ticket.customerQuestionId },
  })
  if (!question || question.clientKey !== input.clientKey) {
    throw new Error('TICKET_NOT_FOUND')
  }

  const ownerId = questionUserId(question.context)
  if (!ownerId || ownerId !== input.userId) {
    throw new Error('TICKET_FORBIDDEN')
  }

  const now = new Date()
  const reopened = TERMINAL_STATUSES.has(ticket.status)

  await db.helpMessage.create({
    data: {
      ticketId: ticket.id,
      role: 'CUSTOMER',
      body: input.body,
    },
  })

  const gate = input.intakeGate ?? question.intakeGate ?? ticket.intakeGate
  const gateMeta = gate ? INTAKE_GATE_META[gate] : null
  const gateBlocksKnights = gate === 'BILLING' || gate === 'BUILD'
  const autoKnights =
    shouldAutoKnightsOnQuestion() && (gateMeta?.autoKnightsOk ?? true)

  const nextStatus = reopened ? 'WAITING' : 'WAITING'
  const breached = isSlaBreached({
    firstResponseAt: ticket.firstResponseAt,
    firstResponseDueAt: ticket.firstResponseDueAt,
    resolveDueAt: ticket.resolveDueAt,
    resolvedAt: reopened ? null : ticket.resolvedAt,
    status: nextStatus,
    now,
  })

  await db.helpTicket.update({
    where: { id: ticket.id },
    data: {
      status: nextStatus,
      ...(reopened
        ? {
            resolvedAt: null,
            closeReason: null,
          }
        : {}),
      ...(breached && !ticket.slaBreachedAt
        ? { slaBreachedAt: now, slaEscalatedAt: ticket.slaEscalatedAt ?? now }
        : {}),
    },
  })

  const mergedContext: Record<string, unknown> = {
    ...(question.context &&
    typeof question.context === 'object' &&
    !Array.isArray(question.context)
      ? (question.context as Record<string, unknown>)
      : {}),
    ...(input.context ?? {}),
    userId: input.userId,
    lastFollowUpAt: now.toISOString(),
  }
  if ('attachments' in mergedContext) {
    delete mergedContext.attachments
  }

  await db.customerQuestion.update({
    where: { id: question.id },
    data: {
      status: 'NEW',
      answer: null,
      draftAnswer: null,
      draftSeat: null,
      delivered: false,
      answeredAt: null,
      directive: Prisma.DbNull,
      context: mergedContext as Prisma.InputJsonValue,
    },
  })

  let attachmentMetas: Awaited<ReturnType<typeof persistAttachments>> = []
  if (input.attachments && input.attachments.length > 0) {
    attachmentMetas = await persistAttachments({
      customerQuestionId: question.id,
      ticketId: ticket.id,
      prepared: input.attachments,
    })
    mergedContext.attachmentMeta = attachmentMetas.map((a) => ({
      id: a.id,
      mimeType: a.mimeType,
      altText: a.altText,
      byteSize: a.byteSize,
    }))
    await db.customerQuestion.update({
      where: { id: question.id },
      data: { context: mergedContext as Prisma.InputJsonValue },
    })
  }

  await audit('computer_agent', 'support.question.followup', question.id, {
    ticketId: ticket.id,
    reopened,
    intakeGate: gate ?? null,
    ...(attachmentMetas.length
      ? { attachments: attachmentAuditMeta(attachmentMetas) }
      : {}),
  })

  let knightsQueued = false
  if (autoKnights && !gateBlocksKnights) {
    const enq = await enqueueInboundKnights({
      questionId: question.id,
      ticketId: ticket.id,
    })
    knightsQueued = enq.queued
    await db.helpMessage.create({
      data: {
        ticketId: ticket.id,
        role: 'SYSTEM',
        body: enq.queued
          ? 'Customer follow-up received — Knights queued for this thread.'
          : 'Customer follow-up — Knights already queued for this thread.',
      },
    })
  } else if (gateBlocksKnights) {
    await db.helpMessage.create({
      data: {
        ticketId: ticket.id,
        role: 'SYSTEM',
        body:
          gate === 'BUILD'
            ? 'BUILD follow-up — paid path; auto-Knights skipped.'
            : 'BILLING follow-up — billing path; auto-Knights skipped.',
      },
    })
  }

  if (reopened) {
    await db.helpMessage.create({
      data: {
        ticketId: ticket.id,
        role: 'SYSTEM',
        body: 'REOPENED — customer follow-up on resolved thread.',
      },
    })
  }

  await raiseAlert({
    kind: 'question',
    severity: 'WARN',
    title: reopened ? 'Help Desk thread reopened' : 'Customer follow-up',
    body: input.body.slice(0, 120),
    entityRef: ticket.id,
    url: `/help-desk?ticket=${ticket.id}`,
  })

  return {
    questionId: question.id,
    ticketId: ticket.id,
    reopened,
    knightsQueued,
    autoKnights: autoKnights && !gateBlocksKnights,
  }
}
