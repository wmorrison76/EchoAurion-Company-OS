import { z } from 'zod'
import { auth } from '@/lib/auth'
import {
  getStandbyConfig,
  setStandbyConfig,
  STANDBY_MODES,
  type StandbyConfig,
  type StandbyMode,
} from '@/lib/standby'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  mode: z.enum(['off', 'draft_only', 'auto_answer_low_risk']),
  maxAutoPerHour: z.number().int().min(0).max(100).optional(),
})

/** GET /api/support/standby — current Knights standby settings. */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const data = await getStandbyConfig()
    return Response.json({ success: true, data } satisfies APIResponse<StandbyConfig>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Standby config failed',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/support/standby — toggle “Standby: Knights may approve low-risk”.
 * Modes: off | draft_only | auto_answer_low_risk
 */
export async function PATCH(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success || !STANDBY_MODES.includes(parsed.data.mode as StandbyMode)) {
      return Response.json(
        { success: false, error: 'Invalid standby mode', code: 'SCHEMA' },
        { status: 400 }
      )
    }
    const data = await setStandbyConfig({
      mode: parsed.data.mode,
      maxAutoPerHour: parsed.data.maxAutoPerHour,
      updatedBy: 'william_morrison',
    })
    return Response.json({ success: true, data } satisfies APIResponse<StandbyConfig>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Standby update failed',
      },
      { status: 500 }
    )
  }
}
