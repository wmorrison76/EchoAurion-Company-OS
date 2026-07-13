import { db } from '@/lib/db'
import { classifySupportRequest } from '@/lib/support-policy'
import { computeSlaDueDates, evaluateSla } from '@/lib/support-sla'
import { isGuestImpactModule } from '@/lib/guest-impact'
import type { IntakeGate } from '@/lib/intake-gate'
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
  intakeGate?: string | null
  intakeChannel?: string | null
  clientKey: string | null
  clientId: string | null
  requesterName: string | null
  workRequestId: string | null
  customerQuestionId: string | null
  boardSessionId: string | null
  createdAt: Date
  updatedAt: Date
  resolvedAt: Date | null
  firstResponseAt?: Date | null
  firstResponseDueAt?: Date | null
  resolveDueAt?: Date | null
  slaBreachedAt?: Date | null
  slaEscalatedAt?: Date | null
  csatScore?: number | null
  csatComment?: string | null
  closeReason?: string | null
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
  agentWorking?: boolean
  rolloutStage?: string | null
  canaryClientKeys?: string[]
  cohortBrowser?: string | null
  cohortOs?: string | null
  cohortAppVersion?: string | null
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
  const gate = (t.intakeGate as IntakeGate | null) ?? null
  const sla = evaluateSla({
    createdAt: t.createdAt,
    intakeGate: gate,
    firstResponseAt: t.firstResponseAt,
    firstResponseDueAt: t.firstResponseDueAt,
    resolveDueAt: t.resolveDueAt,
    resolvedAt: t.resolvedAt,
    slaBreachedAt: t.slaBreachedAt,
    slaEscalatedAt: t.slaEscalatedAt,
    status: t.status,
  })

  return {
    id: t.id,
    channel: t.channel as HelpTicketListItem['channel'],
    status: t.status as HelpTicketListItem['status'],
    priority: t.priority,
    subject: t.subject,
    intakeGate: gate,
    intakeChannel: (t.intakeChannel as HelpTicketListItem['intakeChannel']) ?? 'IN_APP',
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
    agentWorking: t.agentWorking ?? false,
    rolloutStage: t.rolloutStage ?? null,
    canaryClientKeys: t.canaryClientKeys ?? [],
    moduleHint: t.moduleHint ?? null,
    guestImpact: isGuestImpactModule(t.moduleHint),
    firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
    firstResponseDueAt: t.firstResponseDueAt?.toISOString() ?? sla.firstResponseDueAt,
    resolveDueAt: t.resolveDueAt?.toISOString() ?? sla.resolveDueAt,
    slaBreachedAt: t.slaBreachedAt?.toISOString() ?? null,
    slaEscalatedAt: t.slaEscalatedAt?.toISOString() ?? null,
    csatScore: t.csatScore ?? null,
    closeReason: t.closeReason ?? null,
    sla: {
      status: sla.status,
      shape: sla.shape,
      label: sla.label,
      firstResponseStatus: sla.firstResponseStatus,
      resolveStatus: sla.resolveStatus,
      minutesToFirstResponseDue: sla.minutesToFirstResponseDue,
      minutesToResolveDue: sla.minutesToResolveDue,
    },
  }
}

export function toDetail(t: TicketRow): HelpTicketDetail {
  const kind =
    t.channel === 'FEATURE' || t.intakeGate === 'BUILD'
      ? 'ADDON'
      : t.channel === 'SYSTEM'
        ? 'FIX'
        : 'QUESTION'
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
    cohortBrowser: t.cohortBrowser ?? null,
    cohortOs: t.cohortOs ?? null,
    cohortAppVersion: t.cohortAppVersion ?? null,
    csatComment: t.csatComment ?? null,
    messages: (t.messages ?? []).map(toMessageView),
    voiceNotes: (t.voiceNotes ?? []).map(toVoiceView),
    policy: {
      recommendation: verdict.recommendation,
      shape: verdict.shape,
      label: verdict.label,
      operatorHint:
        t.intakeGate === 'BUILD'
          ? 'BUILD gate → paid WorkAgreement path. ' + verdict.operatorHint
          : t.intakeGate === 'BILLING'
            ? 'BILLING gate → billing policy (no code change). ' + verdict.operatorHint
            : t.intakeGate === 'TECH'
              ? 'TECH gate → Knights / system. ' + verdict.operatorHint
              : verdict.operatorHint,
      suggestedTier: verdict.suggestedTier,
      reason: verdict.reason,
    },
  }
}

/** SLA due dates to set on ticket create. */
export function slaDueFieldsForCreate(
  createdAt: Date,
  gate: IntakeGate | null | undefined
): { firstResponseDueAt: Date; resolveDueAt: Date } {
  return computeSlaDueDates(createdAt, gate)
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

    const intakeGate = q.intakeGate ?? null
    const now = new Date()
    const dues = slaDueFieldsForCreate(now, intakeGate as IntakeGate | null)
    const ticket = await db.helpTicket.create({
      data: {
        channel: intakeGate === 'BUILD' ? 'FEATURE' : 'TEXT',
        intakeGate: intakeGate ?? undefined,
        intakeChannel: 'IN_APP',
        status: 'OPEN',
        subject: q.question.slice(0, 120),
        clientKey: q.clientKey,
        clientId: q.clientId,
        customerQuestionId: q.id,
        firstResponseDueAt: dues.firstResponseDueAt,
        resolveDueAt: dues.resolveDueAt,
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

  const workGate: IntakeGate = w.kind === 'ADDON' ? 'BUILD' : 'TECH'
  const workNow = new Date()
  const workDues = slaDueFieldsForCreate(workNow, workGate)

  const ticket = await db.helpTicket.create({
    data: {
      channel: w.kind === 'ADDON' ? 'FEATURE' : 'TEXT',
      intakeGate: workGate,
      intakeChannel: 'IN_APP',
      status: 'OPEN',
      subject: w.title.slice(0, 120),
      clientKey: w.clientKey,
      clientId: w.clientId,
      requesterName: w.requesterName,
      workRequestId: w.id,
      firstResponseDueAt: workDues.firstResponseDueAt,
      resolveDueAt: workDues.resolveDueAt,
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
