import { db } from '@/lib/db'
import { classifySupportRequest } from '@/lib/support-policy'
import type {
  HelpMessageView,
  HelpTicketDetail,
  HelpTicketListItem,
  HelpVoiceNoteView,
} from '@/types/help-desk'

type TicketRow = {
  id: string
  channel: string
  status: string
  priority: string
  subject: string
  clientKey: string | null
  clientId: string | null
  requesterName: string | null
  workRequestId: string | null
  customerQuestionId: string | null
  boardSessionId: string | null
  createdAt: Date
  updatedAt: Date
  resolvedAt: Date | null
  errorScope?: string | null
  errorCategory?: string | null
  productLine?: string | null
  fingerprint?: string | null
  occurrenceCount?: number
  affectedClientKeys?: string[]
  lastOccurredAt?: Date | null
  notifyWhenFixed?: boolean
  sessionHint?: string | null
  errorClass?: string | null
  moduleHint?: string | null
  needsHumanCoreReview?: boolean
  _count?: { messages: number }
  messages?: Array<{
    id: string
    role: string
    body: string
    seat: string | null
    createdAt: Date
  }>
  voiceNotes?: Array<{
    id: string
    transcript: string
    durationSec: number | null
    source: string
    createdAt: Date
  }>
}

export function toMessageView(m: {
  id: string
  role: string
  body: string
  seat: string | null
  createdAt: Date
}): HelpMessageView {
  return {
    id: m.id,
    role: m.role as HelpMessageView['role'],
    body: m.body,
    seat: m.seat,
    createdAt: m.createdAt.toISOString(),
  }
}

export function toVoiceView(v: {
  id: string
  transcript: string
  durationSec: number | null
  source: string
  createdAt: Date
}): HelpVoiceNoteView {
  return {
    id: v.id,
    transcript: v.transcript,
    durationSec: v.durationSec,
    source: v.source as HelpVoiceNoteView['source'],
    createdAt: v.createdAt.toISOString(),
  }
}

export function toListItem(t: TicketRow): HelpTicketListItem {
  return {
    id: t.id,
    channel: t.channel as HelpTicketListItem['channel'],
    status: t.status as HelpTicketListItem['status'],
    priority: t.priority,
    subject: t.subject,
    clientKey: t.clientKey,
    requesterName: t.requesterName,
    workRequestId: t.workRequestId,
    customerQuestionId: t.customerQuestionId,
    messageCount: t._count?.messages ?? t.messages?.length ?? 0,
    updatedAt: t.updatedAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    errorScope: (t.errorScope as HelpTicketListItem['errorScope']) ?? null,
    errorCategory: (t.errorCategory as HelpTicketListItem['errorCategory']) ?? null,
    productLine: t.productLine ?? null,
    fingerprint: t.fingerprint ?? null,
    occurrenceCount: t.occurrenceCount ?? 1,
    affectedClientKeys: t.affectedClientKeys ?? [],
    needsHumanCoreReview: t.needsHumanCoreReview ?? false,
  }
}

export function toDetail(t: TicketRow): HelpTicketDetail {
  const kind =
    t.channel === 'FEATURE' ? 'ADDON' : t.channel === 'SYSTEM' ? 'FIX' : 'QUESTION'
  const verdict = classifySupportRequest({
    kind,
    title: t.subject,
    detail: t.messages?.map((m) => m.body).join('\n').slice(0, 2000) ?? t.subject,
  })

  return {
    ...toListItem(t),
    clientId: t.clientId,
    boardSessionId: t.boardSessionId,
    lastOccurredAt: t.lastOccurredAt?.toISOString() ?? null,
    notifyWhenFixed: t.notifyWhenFixed ?? true,
    sessionHint: t.sessionHint ?? null,
    errorClass: t.errorClass ?? null,
    moduleHint: t.moduleHint ?? null,
    messages: (t.messages ?? []).map(toMessageView),
    voiceNotes: (t.voiceNotes ?? []).map(toVoiceView),
    policy: {
      recommendation: verdict.recommendation,
      shape: verdict.shape,
      label: verdict.label,
      operatorHint: verdict.operatorHint,
      suggestedTier: verdict.suggestedTier,
      reason: verdict.reason,
    },
  }
}

/** Find or create a Help Desk ticket linked to a Support inbox question/work item. */
export async function ensureTicketFromInbox(input: {
  kind: 'question' | 'work'
  id: string
}): Promise<HelpTicketDetail> {
  if (input.kind === 'question') {
    const existing = await db.helpTicket.findFirst({
      where: { customerQuestionId: input.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })
    if (existing) return toDetail(existing)

    const q = await db.customerQuestion.findUnique({ where: { id: input.id } })
    if (!q) throw new Error('Question not found')

    const ticket = await db.helpTicket.create({
      data: {
        channel: 'TEXT',
        status: 'OPEN',
        subject: q.question.slice(0, 120),
        clientKey: q.clientKey,
        clientId: q.clientId,
        customerQuestionId: q.id,
        messages: {
          create: [
            {
              role: 'CUSTOMER',
              body: q.question,
            },
            ...(q.draftAnswer
              ? [
                  {
                    role: 'KNIGHT' as const,
                    body: q.draftAnswer,
                    seat: q.draftSeat,
                  },
                ]
              : []),
            ...(q.answer
              ? [
                  {
                    role: 'ADMIN' as const,
                    body: q.answer,
                  },
                ]
              : []),
          ],
        },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })
    return toDetail(ticket)
  }

  const existing = await db.helpTicket.findFirst({
    where: { workRequestId: input.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      voiceNotes: { orderBy: { createdAt: 'asc' } },
      _count: { select: { messages: true } },
    },
  })
  if (existing) return toDetail(existing)

  const w = await db.workRequest.findUnique({ where: { id: input.id } })
  if (!w) throw new Error('Work request not found')

  const ticket = await db.helpTicket.create({
    data: {
      channel: w.kind === 'ADDON' ? 'FEATURE' : 'TEXT',
      status: 'OPEN',
      subject: w.title.slice(0, 120),
      clientKey: w.clientKey,
      clientId: w.clientId,
      requesterName: w.requesterName,
      workRequestId: w.id,
      messages: {
        create: [
          {
            role: 'CUSTOMER',
            body: `${w.title}\n\n${w.detail}`,
          },
          ...(w.draftPlan
            ? [
                {
                  role: 'KNIGHT' as const,
                  body: w.draftPlan,
                  seat: w.draftSeat,
                },
              ]
            : []),
        ],
      },
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      voiceNotes: { orderBy: { createdAt: 'asc' } },
      _count: { select: { messages: true } },
    },
  })
  return toDetail(ticket)
}

export const HELP_DESK_MACROS = [
  {
    id: 'ack_received',
    label: 'Ack received',
    body: 'Got it — looking into this now and will follow up shortly.',
  },
  {
    id: 'need_more_info',
    label: 'Need more info',
    body: 'Thanks for flagging this. Can you share which screen you were on and what you expected to see?',
  },
  {
    id: 'resolved_config',
    label: 'Resolved via config',
    body: 'This looks like a settings change rather than a bug. Here is the path to flip it — let me know if it still looks off after that.',
  },
  {
    id: 'quote_next',
    label: 'Quote next',
    body: 'This needs a custom build. I will send a short quote for your billing contact to approve before we start.',
  },
] as const
