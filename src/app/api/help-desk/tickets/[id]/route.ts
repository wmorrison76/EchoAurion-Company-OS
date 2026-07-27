import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import { onErrorTicketResolved } from '@/lib/error-resolve'
import { isSlaBreached } from '@/lib/support-sla'
import { publishCsatRequest } from '@/lib/support-csat'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail, HelpTicketStatus } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

const DETAIL_INCLUDE = {
  messages: { orderBy: { createdAt: 'asc' as const } },
  voiceNotes: { orderBy: { createdAt: 'asc' as const } },
  attachments: { orderBy: { createdAt: 'asc' as const } },
  _count: { select: { messages: true } },
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const { id } = await params
    const ticket = await db.helpTicket.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    })
    if (!ticket) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }
    return Response.json({
      success: true,
      data: toDetail(ticket),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Help Desk fetch failed',
      },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = (await req.json()) as {
      status?: HelpTicketStatus
      priority?: string
      subject?: string
      requesterName?: string
      canaryClientKeys?: string[]
      rolloutStage?: 'canary' | 'fleet' | null
      fixSummary?: string
      csatScore?: number
      csatComment?: string
      closeReason?: string
    }

    const existing = await db.helpTicket.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }

    if (body.csatScore != null && (body.csatScore < 1 || body.csatScore > 5)) {
      return Response.json(
        { success: false, error: 'csatScore must be 1–5' },
        { status: 400 }
      )
    }

    let resolvedAt: Date | null | undefined
    if (body.status === 'RESOLVED' || body.status === 'CLOSED') {
      resolvedAt = existing.resolvedAt ?? new Date()
    } else if (body.status) {
      resolvedAt = null
    }

    const becomingResolved =
      (body.status === 'RESOLVED' || body.status === 'CLOSED') &&
      existing.status !== 'RESOLVED' &&
      existing.status !== 'CLOSED'

    const now = new Date()
    const effectiveResolved = resolvedAt === undefined ? existing.resolvedAt : resolvedAt
    const breached = isSlaBreached({
      firstResponseAt: existing.firstResponseAt,
      firstResponseDueAt: existing.firstResponseDueAt,
      resolveDueAt: existing.resolveDueAt,
      resolvedAt: effectiveResolved,
      status: body.status ?? existing.status,
      now,
    })

    const ticket = await db.helpTicket.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.priority ? { priority: body.priority } : {}),
        ...(body.subject ? { subject: body.subject.trim() } : {}),
        ...(body.requesterName !== undefined
          ? { requesterName: body.requesterName?.trim() || null }
          : {}),
        ...(resolvedAt !== undefined ? { resolvedAt } : {}),
        ...(body.canaryClientKeys
          ? { canaryClientKeys: body.canaryClientKeys.filter(Boolean) }
          : {}),
        ...(body.rolloutStage !== undefined ? { rolloutStage: body.rolloutStage } : {}),
        ...(body.csatScore != null ? { csatScore: body.csatScore } : {}),
        ...(body.csatComment !== undefined
          ? { csatComment: body.csatComment?.trim().slice(0, 500) || null }
          : {}),
        ...(body.closeReason !== undefined
          ? { closeReason: body.closeReason?.trim().slice(0, 80) || null }
          : {}),
        ...(breached && !existing.slaBreachedAt
          ? { slaBreachedAt: now, slaEscalatedAt: existing.slaEscalatedAt ?? now }
          : {}),
      },
      include: DETAIL_INCLUDE,
    })

    if (becomingResolved) {
      await onErrorTicketResolved({
        ticketId: id,
        finalFixSummary: body.fixSummary ?? null,
        actor: 'william_morrison',
      }).catch((err) => {
        console.error('[help-desk] onErrorTicketResolved failed', err)
      })

      // Property UI CSAT surface via relay (skip if operator already scored).
      if (body.csatScore == null) {
        void publishCsatRequest({
          ticketId: id,
          clientKey: ticket.clientKey ?? existing.clientKey,
          subject: ticket.subject,
        }).catch((err) => {
          console.error('[help-desk] publishCsatRequest failed', err)
        })
      }
    }

    if (breached && !existing.slaBreachedAt) {
      await db.alert
        .create({
          data: {
            kind: 'system',
            severity: 'WARN',
            title: `SLA breach · ticket ${id.slice(0, 8)}`,
            body: `Help Desk SLA breached for ${existing.subject.slice(0, 80)}`,
            entityRef: id,
          },
        })
        .catch(() => {})
    }

    await audit('william_morrison', 'help_desk.ticket.update', id, {
      status: body.status,
      priority: body.priority,
      rolloutStage: body.rolloutStage,
      csatScore: body.csatScore,
      closeReason: body.closeReason,
    })

    const refreshed = becomingResolved
      ? await db.helpTicket.findUnique({ where: { id }, include: DETAIL_INCLUDE })
      : ticket

    return Response.json({
      success: true,
      data: toDetail(refreshed ?? ticket),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Help Desk update failed',
      },
      { status: 500 }
    )
  }
}
