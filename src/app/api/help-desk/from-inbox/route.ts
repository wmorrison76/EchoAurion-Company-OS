import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { ensureTicketFromInbox } from '@/lib/help-desk'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

/** Find or create a Help Desk ticket from an Inbox question / work item. */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { kind?: 'question' | 'work'; id?: string }
    if (!body.kind || !body.id) {
      return Response.json(
        { success: false, error: 'kind and id are required' },
        { status: 400 }
      )
    }
    if (body.kind !== 'question' && body.kind !== 'work') {
      return Response.json({ success: false, error: 'kind must be question or work' }, { status: 400 })
    }

    const ticket = await ensureTicketFromInbox({ kind: body.kind, id: body.id })
    await audit('william_morrison', 'help_desk.ticket.import', ticket.id, {
      kind: body.kind,
      sourceId: body.id,
    })

    return Response.json({
      success: true,
      data: ticket,
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Import failed',
      },
      { status: 500 }
    )
  }
}
