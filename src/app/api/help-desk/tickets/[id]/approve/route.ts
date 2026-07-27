import { auth } from '@/lib/auth'
import { approveHelpTicket } from '@/lib/help-desk-approve'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

/**
 * Approve a knight draft (or custom reply) as the official admin answer.
 * Optionally syncs back to a linked CustomerQuestion.
 *
 * Modes:
 * - reply: send/store admin answer text
 * - approve_free: mark feature/work as complimentary (admin gift)
 * - send_quote: keep FEATURE ticket open and nudge work request toward QUOTED
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
      mode?: 'reply' | 'approve_free' | 'send_quote'
      answer?: string
      knightMessageId?: string
    }

    const result = await approveHelpTicket({
      ticketId: id,
      mode: body.mode,
      answer: body.answer,
      knightMessageId: body.knightMessageId,
      actor: 'william_morrison',
    })

    if (!result.ok) {
      return Response.json({ success: false, error: result.error }, { status: result.status })
    }

    return Response.json({
      success: true,
      data: result.detail,
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Approve failed',
      },
      { status: 500 }
    )
  }
}
