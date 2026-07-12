import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import { classifyErrorScope } from '@/lib/error-scope'
import type { APIResponse } from '@/types'
import type { ErrorBlastScope, HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

/**
 * POST /api/help-desk/tickets/[id]/promote-scope
 * Manually promote (or set) error blast scope. Never demotes GLOBAL.
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
    const body = (await req.json()) as { scope?: ErrorBlastScope }
    const target = body.scope ?? 'GLOBAL'
    if (!['USER', 'ACCOUNT', 'GLOBAL'].includes(target)) {
      return Response.json({ success: false, error: 'Invalid scope' }, { status: 400 })
    }

    const existing = await db.helpTicket.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }

    let next: ErrorBlastScope = target
    if (existing.errorScope === 'GLOBAL') next = 'GLOBAL'
    else if (target === 'USER' && existing.errorScope === 'ACCOUNT') next = 'ACCOUNT'
    else {
      next = classifyErrorScope({
        message: existing.subject,
        errorClass: existing.errorClass,
        moduleHint: existing.moduleHint,
        scopeHint: target,
        knownClientKeys: existing.affectedClientKeys,
      })
      if (target === 'GLOBAL') next = 'GLOBAL'
      if (target === 'ACCOUNT' && next === 'USER') next = 'ACCOUNT'
    }

    const ticket = await db.helpTicket.update({
      where: { id },
      data: {
        errorScope: next,
        priority: next === 'GLOBAL' ? 'URGENT' : next === 'ACCOUNT' ? 'HIGH' : existing.priority,
        messages: {
          create: {
            role: 'SYSTEM',
            body: `Scope set to ${next} by operator (was ${existing.errorScope ?? 'unset'}).`,
          },
        },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'help_desk.error_event.promote_scope', id, {
      from: existing.errorScope,
      to: next,
    })

    return Response.json({
      success: true,
      data: toDetail(ticket),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Promote failed',
      },
      { status: 500 }
    )
  }
}
