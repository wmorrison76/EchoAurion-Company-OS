import { auth } from '@/lib/auth'
import { listTimelineEvents, recordTimelineEvent, TIMELINE_KINDS } from '@/lib/help-timeline'
import { z } from 'zod'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const postSchema = z.object({
  kind: z.enum(TIMELINE_KINDS as unknown as [string, ...string[]]),
  label: z.string().max(120).optional(),
  detail: z.string().max(2000).optional(),
  visibleToCustomer: z.boolean().optional(),
})

/** GET /api/help-desk/tickets/[id]/timeline */
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
    const data = await listTimelineEvents(id)
    return Response.json({ success: true, data } satisfies APIResponse<typeof data>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Timeline failed',
      },
      { status: 500 }
    )
  }
}

/** POST /api/help-desk/tickets/[id]/timeline — append customer-visible event. */
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
    const parsed = postSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid timeline event', code: 'SCHEMA' }, { status: 400 })
    }
    const data = await recordTimelineEvent({
      ticketId: id,
      kind: parsed.data.kind as (typeof TIMELINE_KINDS)[number],
      label: parsed.data.label,
      detail: parsed.data.detail,
      visibleToCustomer: parsed.data.visibleToCustomer,
      actor: 'william_morrison',
    })
    return Response.json({ success: true, data } satisfies APIResponse<typeof data>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Timeline write failed',
      },
      { status: 500 }
    )
  }
}
