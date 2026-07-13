import { z } from 'zod'
import { auth } from '@/lib/auth'
import { listOpenCohortTickets, sendCohortMessage } from '@/lib/cohort-messaging'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/** GET — open COHORT SYSTEM tickets for messaging UI. */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const data = await listOpenCohortTickets(40)
    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<typeof data>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cohort list failed',
      },
      { status: 500 }
    )
  }
}

const postSchema = z.object({
  ticketId: z.string().min(1),
  title: z.string().max(120).optional(),
  body: z.string().min(1).max(500),
  severity: z.enum(['info', 'success', 'warning']).optional(),
})

/** POST — send floor-safe cohort show_message to matched pilots. */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = postSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid cohort message payload' }, { status: 400 })
    }
    const result = await sendCohortMessage({
      ticketId: parsed.data.ticketId,
      title: parsed.data.title,
      body: parsed.data.body,
      severity: parsed.data.severity,
      actor: 'william_morrison',
    })
    if (!result.ok) {
      const status =
        result.code === 'NOT_FOUND' ? 404 : result.code === 'STACK_FORBIDDEN' ? 400 : 400
      return Response.json(
        { success: false, error: result.error, code: result.code },
        { status }
      )
    }
    return Response.json({
      success: true,
      data: { notified: result.notified, clientKeys: result.clientKeys },
    } satisfies APIResponse<{ notified: number; clientKeys: string[] }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cohort notify failed',
      },
      { status: 500 }
    )
  }
}
