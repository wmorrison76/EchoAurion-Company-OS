import { auth } from '@/lib/auth'
import { dispatchKnightsOnTicket } from '@/lib/help-desk-knights'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

/**
 * Ask the Knights for counsel on this ticket.
 * Appends KNIGHT messages to the thread, then sets status AWAITING_APPROVAL.
 * Nothing is sent to the customer until William approves (unless standby
 * auto-approves low-risk TEXT).
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
    const result = await dispatchKnightsOnTicket(id, { actor: 'william_morrison' })
    return Response.json({
      success: true,
      data: result.ticket,
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Knights dispatch failed'
    const status = message.includes('not found')
      ? 404
      : message.includes('No AI seat')
        ? 502
        : 500
    return Response.json({ success: false, error: message }, { status })
  }
}
