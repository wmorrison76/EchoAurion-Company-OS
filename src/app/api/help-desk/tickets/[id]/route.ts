import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import { onErrorTicketResolved } from '@/lib/error-resolve'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail, HelpTicketStatus } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

const DETAIL_INCLUDE = {
  messages: { orderBy: { createdAt: 'asc' as const } },
  voiceNotes: { orderBy: { createdAt: 'asc' as const } },
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
    }

    const existing = await db.helpTicket.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
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
    }

    await audit('william_morrison', 'help_desk.ticket.update', id, {
      status: body.status,
      priority: body.priority,
      rolloutStage: body.rolloutStage,
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
