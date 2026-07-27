import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import { promoteCanaryToFleet } from '@/lib/error-notify'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

/**
 * POST /api/help-desk/tickets/[id]/canary
 * Set canary clientKeys (Canary then fleet) or promote canary → fleet notify.
 *
 * Body:
 *   { action: 'set', canaryClientKeys: string[] }
 *   { action: 'promote_fleet' }
 */
export async function POST(
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
      action?: 'set' | 'promote_fleet'
      canaryClientKeys?: string[]
    }
    const action = body.action ?? 'set'

    const existing = await db.helpTicket.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }

    if (action === 'promote_fleet') {
      const result = await promoteCanaryToFleet(id)
      await audit('william_morrison', 'help_desk.error_event.canary_fleet', id, result)
      const ticket = await db.helpTicket.findUnique({
        where: { id },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          voiceNotes: { orderBy: { createdAt: 'asc' } },
          _count: { select: { messages: true } },
        },
      })
      return Response.json({
        success: true,
        data: {
          ticket: toDetail(ticket!),
          notified: result.notified,
          skipped: result.skipped,
          reason: result.reason ?? null,
        },
      } satisfies APIResponse<{
        ticket: HelpTicketDetail
        notified: number
        skipped: boolean
        reason: string | null
      }>)
    }

    const keys = (body.canaryClientKeys ?? []).map((k) => k.trim()).filter(Boolean)
    const ticket = await db.helpTicket.update({
      where: { id },
      data: {
        canaryClientKeys: keys,
        rolloutStage: keys.length ? 'canary' : null,
        messages: {
          create: {
            role: 'SYSTEM',
            body: keys.length
              ? `Canary then fleet enabled — ${keys.length} canary clientKey(s): ${keys.join(', ')}`
              : 'Canary list cleared — GLOBAL resolve will notify full fleet.',
          },
        },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'help_desk.error_event.canary_set', id, {
      canaryClientKeys: keys,
    })

    return Response.json({
      success: true,
      data: toDetail(ticket),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Canary update failed',
      },
      { status: 500 }
    )
  }
}
