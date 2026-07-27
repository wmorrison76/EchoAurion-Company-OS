import { z } from 'zod'
import { auth } from '@/lib/auth'
import {
  AUTONOMY_DIALS,
  getAutonomyConfig,
  setAutonomyDial,
  type AutonomyConfig,
  type AutonomyDial,
} from '@/lib/autonomy'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  dial: z.enum(['assist', 'standby', 'autopilot']),
  maxAutoPerHour: z.number().int().min(0).max(100).optional(),
})

/** GET /api/support/autonomy — elite autonomy dial + limits. */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const data = await getAutonomyConfig()
    return Response.json({ success: true, data } satisfies APIResponse<AutonomyConfig>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Autonomy config failed',
      },
      { status: 500 }
    )
  }
}

/** PATCH /api/support/autonomy — set assist | standby | autopilot. */
export async function PATCH(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success || !AUTONOMY_DIALS.includes(parsed.data.dial as AutonomyDial)) {
      return Response.json(
        { success: false, error: 'Invalid autonomy dial', code: 'SCHEMA' },
        { status: 400 }
      )
    }
    const data = await setAutonomyDial({
      dial: parsed.data.dial,
      maxAutoPerHour: parsed.data.maxAutoPerHour,
      updatedBy: 'william_morrison',
    })
    return Response.json({ success: true, data } satisfies APIResponse<AutonomyConfig>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Autonomy update failed',
      },
      { status: 500 }
    )
  }
}
