import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail, toListItem, slaDueFieldsForCreate } from '@/lib/help-desk'
import { ensureReceivedEvent } from '@/lib/help-timeline'
import { parseIntakeGate } from '@/lib/intake-gate'
import type { APIResponse } from '@/types'
import type {
  HelpTicketChannel,
  HelpTicketDetail,
  HelpTicketListItem,
  HelpTicketStatus,
} from '@/types/help-desk'

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const filter = url.searchParams.get('filter') // open | voice | feature | awaiting | all | breached
    const gateFilter = url.searchParams.get('gate') // TECH | BILLING | BUILD | OTHER
    const openStatuses: HelpTicketStatus[] = [
      'OPEN',
      'WAITING',
      'WITH_KNIGHTS',
      'AWAITING_APPROVAL',
    ]
    const where =
      filter === 'voice'
        ? { channel: 'VOICE' as const }
        : filter === 'feature'
          ? { channel: 'FEATURE' as const }
          : filter === 'awaiting'
            ? { status: 'AWAITING_APPROVAL' as const }
            : filter === 'breached'
              ? {
                  status: { in: openStatuses },
                  OR: [
                    { slaBreachedAt: { not: null } },
                    {
                      firstResponseAt: null,
                      firstResponseDueAt: { lt: new Date() },
                    },
                    { resolveDueAt: { lt: new Date() } },
                  ],
                }
              : filter === 'all'
                ? {}
                : { status: { in: openStatuses } }

    const tickets = await db.helpTicket.findMany({
      where: {
        ...where,
        ...(gateFilter &&
        ['TECH', 'BILLING', 'BUILD', 'OTHER'].includes(gateFilter)
          ? { intakeGate: gateFilter as 'TECH' | 'BILLING' | 'BUILD' | 'OTHER' }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
      include: { _count: { select: { messages: true } } },
    })

    const data = tickets.map(toListItem)
    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<HelpTicketListItem[]>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Help Desk list failed',
      },
      { status: 500 }
    )
  }
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      channel?: HelpTicketChannel
      subject?: string
      body?: string
      clientKey?: string
      clientId?: string
      requesterName?: string
      priority?: string
      workRequestId?: string
      customerQuestionId?: string
      boardSessionId?: string
      spawnWorkRequest?: boolean
      intakeGate?: string
    }

    const subject = body.subject?.trim()
    if (!subject) {
      return Response.json({ success: false, error: 'subject is required' }, { status: 400 })
    }

    const channel: HelpTicketChannel = body.channel ?? 'TEXT'
    let workRequestId = body.workRequestId ?? null
    const intakeGate = parseIntakeGate(body.intakeGate)

    if (channel === 'FEATURE' && body.spawnWorkRequest && !workRequestId) {
      const work = await db.workRequest.create({
        data: {
          clientKey: body.clientKey?.trim() || 'manual',
          clientId: body.clientId ?? null,
          kind: 'ADDON',
          title: subject,
          detail: body.body?.trim() || subject,
          requesterName: body.requesterName ?? null,
          status: 'RECEIVED',
          actor: 'william_morrison',
        },
      })
      workRequestId = work.id
      await audit('william_morrison', 'work.request.create', work.id, {
        from: 'help_desk',
        title: subject,
      })
    }

    const now = new Date()
    const dues = slaDueFieldsForCreate(now, intakeGate)

    const ticket = await db.helpTicket.create({
      data: {
        channel,
        status: 'OPEN',
        priority: body.priority?.trim() || 'NORMAL',
        subject,
        intakeGate: intakeGate ?? (channel === 'FEATURE' ? 'BUILD' : null),
        clientKey: body.clientKey?.trim() || null,
        clientId: body.clientId ?? null,
        requesterName: body.requesterName?.trim() || null,
        workRequestId,
        customerQuestionId: body.customerQuestionId ?? null,
        boardSessionId: body.boardSessionId ?? null,
        firstResponseDueAt: dues.firstResponseDueAt,
        resolveDueAt: dues.resolveDueAt,
        messages: {
          create: [
            {
              role: 'SYSTEM',
              body: `Ticket opened · channel ${channel}`,
            },
            ...(body.body?.trim()
              ? [
                  {
                    role: (channel === 'FEATURE' ? 'CUSTOMER' : 'ADMIN') as 'CUSTOMER' | 'ADMIN',
                    body: body.body.trim(),
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

    await audit('william_morrison', 'help_desk.ticket.create', ticket.id, {
      channel,
      subject,
      workRequestId,
    })
    await ensureReceivedEvent(ticket.id, subject).catch(() => {})

    return Response.json({
      success: true,
      data: toDetail(ticket),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Help Desk create failed',
      },
      { status: 500 }
    )
  }
}
