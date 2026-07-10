import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { classifySupportRequest } from '@/lib/support-policy'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  clientKey: z.string().min(1).max(200).default('board-room-sandbox'),
  kind: z.enum(['FIX', 'ADDON']).default('FIX'),
  title: z.string().min(1).max(200).optional(),
  detail: z.string().min(1).max(8000).optional(),
  /** Prefer Free answer / complimentary vs quote — stored in context for Support UI. */
  billingPolicy: z.enum(['FREE', 'CHARGE']).default('FREE'),
})

/**
 * POST /api/board-room/sessions/:id/work-request
 * One-click: Board Room synthesis → Support WorkRequest (sandbox draft).
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const board = await db.boardRoomSession.findUnique({ where: { id: params.id } })
    if (!board) {
      return Response.json({ success: false, error: 'Session not found' }, { status: 404 })
    }
    if (!board.synthesis?.trim()) {
      return Response.json(
        { success: false, error: 'Session has no synthesis to draft from' },
        { status: 400 }
      )
    }

    const body = schema.safeParse(await req.json().catch(() => ({})))
    if (!body.success) {
      return Response.json({ success: false, error: 'Invalid work-request payload' }, { status: 400 })
    }

    const d = body.data
    const title =
      d.title?.trim() ||
      `Board Room draft: ${board.problem.slice(0, 80)}${board.problem.length > 80 ? '…' : ''}`
    const detail = d.detail?.trim() || board.synthesis
    const client = await db.supportClient.findUnique({ where: { clientKey: d.clientKey } })

    const verdict = classifySupportRequest({
      kind: d.kind,
      title,
      detail,
    })

    const created = await db.workRequest.create({
      data: {
        clientKey: d.clientKey,
        clientId: client?.id ?? null,
        kind: d.kind,
        title,
        detail,
        draftSeat: 'maestro',
        draftPlan: board.synthesis,
        context: {
          source: 'board_room',
          sessionId: board.id,
          sandbox: true,
          billingPolicy: d.billingPolicy,
          policyRecommendation: verdict.recommendation,
          policyLabel: verdict.label,
        },
        actor: 'william_morrison',
        status: 'RECEIVED',
      },
    })

    await audit('william_morrison', 'board_room.work_request.create', created.id, {
      sessionId: board.id,
      billingPolicy: d.billingPolicy,
    })

    await raiseAlert({
      kind: 'question',
      severity: 'INFO',
      title: `Board → Support: ${title.slice(0, 80)}`,
      body: `${d.billingPolicy === 'FREE' ? '✓ Free / complimentary chip' : '$ Quote chip'} · sandbox draft from Board Room`,
      entityRef: created.id,
      url: '/support/inbox',
    })

    return Response.json(
      {
        success: true,
        data: {
          id: created.id,
          billingPolicy: d.billingPolicy,
          policyLabel: verdict.label,
          href: '/support/inbox',
        },
      } satisfies APIResponse<{
        id: string
        billingPolicy: string
        policyLabel: string
        href: string
      }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Work request create failed',
      },
      { status: 500 }
    )
  }
}
