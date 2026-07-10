import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import { draftAnswer, draftPlan, pickDraftSeat } from '@/lib/support-relay'
import { dispatch } from '@/lib/board-room/connectors'
import { ROSTER, knightConfigured } from '@/lib/board-room/knights'
import { answerDraftSystemPrompt } from '@/lib/support-voice'
import type { Seat } from '@/types/board-room'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

const EXTRA_SEATS: Seat[] = ['strategist', 'analyst', 'scout']

/**
 * Ask the Knights for counsel on this ticket.
 * Appends KNIGHT messages to the thread, then sets status AWAITING_APPROVAL.
 * Nothing is sent to the customer until William approves.
 */
export async function POST(
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
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!ticket) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }

    if (!pickDraftSeat()) {
      return Response.json(
        { success: false, error: 'No AI seat is configured — set knight API keys' },
        { status: 502 }
      )
    }

    await db.helpTicket.update({
      where: { id },
      data: { status: 'WITH_KNIGHTS' },
    })
    await db.helpMessage.create({
      data: {
        ticketId: id,
        role: 'SYSTEM',
        body: 'Asking the Knights of the Round Table… drafts are for your review only — nothing is sent until you Approve.',
      },
    })

    const thread = ticket.messages
      .filter((m) => m.role !== 'SYSTEM')
      .map((m) => `[${m.role}${m.seat ? `:${m.seat}` : ''}] ${m.body}`)
      .join('\n\n')
      .slice(0, 6000)

    const prompt = `Help Desk ticket: ${ticket.subject}\nChannel: ${ticket.channel}\n\nThread:\n${thread || ticket.subject}`

    const knightBodies: Array<{ seat: string | null; body: string }> = []

    if (ticket.channel === 'FEATURE') {
      const plan = await draftPlan(ticket.subject, thread || ticket.subject, 'ADDON')
      if (plan.answer) {
        knightBodies.push({ seat: plan.seat, body: plan.answer })
      } else if (plan.error) {
        await db.helpMessage.create({
          data: {
            ticketId: id,
            role: 'SYSTEM',
            body: `Knights draft unavailable: ${plan.error}`,
          },
        })
      }
    } else {
      const primary = await draftAnswer(prompt)
      if (primary.answer) {
        knightBodies.push({ seat: primary.seat, body: primary.answer })
      } else if (primary.error) {
        await db.helpMessage.create({
          data: {
            ticketId: id,
            role: 'SYSTEM',
            body: `Primary knight unavailable: ${primary.error}`,
          },
        })
      }

      // Optional second opinions from other configured seats (best-effort).
      const extras = EXTRA_SEATS.filter(
        (s) => s !== primary.seat && knightConfigured(ROSTER[s])
      ).slice(0, 2)

      const extraResults = await Promise.allSettled(
        extras.map(async (seat) => {
          const result = await dispatch(ROSTER[seat], {
            system: answerDraftSystemPrompt(),
            user: prompt,
          })
          if (result.status === 'RESPONDED' && result.content) {
            return { seat, body: result.content }
          }
          return null
        })
      )

      for (const r of extraResults) {
        if (r.status === 'fulfilled' && r.value) {
          knightBodies.push({ seat: r.value.seat, body: r.value.body })
        }
      }
    }

    for (const k of knightBodies) {
      await db.helpMessage.create({
        data: {
          ticketId: id,
          role: 'KNIGHT',
          body: k.body,
          seat: k.seat,
        },
      })
    }

    if (knightBodies.length === 0) {
      await db.helpMessage.create({
        data: {
          ticketId: id,
          role: 'SYSTEM',
          body: 'No knight responses returned. Check API keys or reply manually.',
        },
      })
    }

    const updated = await db.helpTicket.update({
      where: { id },
      data: {
        status: knightBodies.length > 0 ? 'AWAITING_APPROVAL' : 'OPEN',
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'help_desk.knights.dispatch', id, {
      seats: knightBodies.map((k) => k.seat),
      count: knightBodies.length,
    })

    return Response.json({
      success: true,
      data: toDetail(updated),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Knights dispatch failed',
      },
      { status: 500 }
    )
  }
}
