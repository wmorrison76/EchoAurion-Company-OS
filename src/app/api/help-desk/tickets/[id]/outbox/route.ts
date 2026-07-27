import { auth } from '@/lib/auth'
import { listRecentOutbox } from '@/lib/relay-outbox'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/** Last outbox events for this ticket's clientKey (delivery status). */
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
      select: { clientKey: true },
    })
    if (!ticket) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }
    if (!ticket.clientKey) {
      return Response.json({
        success: true,
        data: { clientKey: null, events: [], note: 'No clientKey on ticket' },
      })
    }

    const events = await listRecentOutbox(ticket.clientKey, 15)
    return Response.json({
      success: true,
      data: {
        clientKey: ticket.clientKey,
        events,
        note: 'SSE will push when pilot connected',
      },
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<{
      clientKey: string
      events: typeof events
      note: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Outbox status failed',
      },
      { status: 500 }
    )
  }
}
