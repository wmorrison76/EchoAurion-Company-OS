import { z } from 'zod'
import { auth } from '@/lib/auth'
import {
  approveBreakGlass,
  listBreakGlass,
  requestBreakGlass,
  revokeBreakGlass,
  type BreakGlassView,
} from '@/lib/break-glass'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  action: z.literal('request'),
  clientKey: z.string().min(1).max(120),
  reason: z.string().min(8).max(500),
  durationMinutes: z.number().int().min(15).max(60).optional(),
})

const approveSchema = z.object({
  action: z.literal('approve'),
  id: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(60).optional(),
})

const revokeSchema = z.object({
  action: z.literal('revoke'),
  id: z.string().min(1),
})

/** GET /api/help-desk/break-glass — list sessions (scaffold). */
export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const clientKey = new URL(req.url).searchParams.get('clientKey') ?? undefined
    const data = await listBreakGlass(clientKey)
    return Response.json({ success: true, data } satisfies APIResponse<BreakGlassView[]>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Break-glass list failed',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/help-desk/break-glass — request | approve | revoke.
 * Banner: NOT TeamViewer — no RDP.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const action = body?.action as string
    if (action === 'request') {
      const parsed = requestSchema.safeParse(body)
      if (!parsed.success) {
        return Response.json({ success: false, error: 'Invalid request', code: 'SCHEMA' }, { status: 400 })
      }
      const data = await requestBreakGlass({
        clientKey: parsed.data.clientKey,
        reason: parsed.data.reason,
        requestedBy: session.user.email ?? 'william_morrison',
        durationMinutes: parsed.data.durationMinutes,
      })
      return Response.json({ success: true, data } satisfies APIResponse<BreakGlassView>)
    }
    if (action === 'approve') {
      const parsed = approveSchema.safeParse(body)
      if (!parsed.success) {
        return Response.json({ success: false, error: 'Invalid approve', code: 'SCHEMA' }, { status: 400 })
      }
      const data = await approveBreakGlass({
        id: parsed.data.id,
        approvedBy: session.user.email ?? 'william_morrison',
        durationMinutes: parsed.data.durationMinutes,
      })
      return Response.json({ success: true, data } satisfies APIResponse<BreakGlassView>)
    }
    if (action === 'revoke') {
      const parsed = revokeSchema.safeParse(body)
      if (!parsed.success) {
        return Response.json({ success: false, error: 'Invalid revoke', code: 'SCHEMA' }, { status: 400 })
      }
      const data = await revokeBreakGlass(parsed.data.id, session.user.email ?? 'william_morrison')
      return Response.json({ success: true, data } satisfies APIResponse<BreakGlassView>)
    }
    return Response.json({ success: false, error: 'Unknown action', code: 'SCHEMA' }, { status: 400 })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Break-glass failed',
      },
      { status: 400 }
    )
  }
}
