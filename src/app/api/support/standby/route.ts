import { z } from 'zod'
import { auth } from '@/lib/auth'
import {
  getStandbyConfig,
  setStandbyConfig,
  setHelpDeskAutoSendPermit,
  STANDBY_MODES,
  type StandbyConfig,
  type StandbyMode,
} from '@/lib/standby'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const patchSchema = z
  .object({
    mode: z
      .enum([
        'off',
        'draft_only',
        'auto_answer_low_risk',
        'assist',
        'standby',
        'autopilot',
      ])
      .optional(),
    maxAutoPerHour: z.number().int().min(0).max(100).optional(),
    helpDeskAutoSendEnabled: z.boolean().optional(),
    /** ISO-8601 or datetime-local; required when enabling; ignored when disabling. */
    helpDeskAutoSendUntil: z.string().min(1).nullable().optional(),
  })
  .refine(
    (v) =>
      v.mode !== undefined ||
      v.maxAutoPerHour !== undefined ||
      v.helpDeskAutoSendEnabled !== undefined,
    { message: 'No fields to update' }
  )
  .refine(
    (v) =>
      v.helpDeskAutoSendEnabled !== true ||
      (typeof v.helpDeskAutoSendUntil === 'string' &&
        !Number.isNaN(new Date(v.helpDeskAutoSendUntil).getTime())),
    { message: 'helpDeskAutoSendUntil must be a valid future datetime when enabling' }
  )

/** GET /api/support/standby — current Knights standby + auto-send permit settings. */
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
 * PATCH /api/support/standby — standby mode and/or timed Help Desk auto-send permit.
 * Modes: off | draft_only | auto_answer_low_risk | assist | standby | autopilot
 * Permit: helpDeskAutoSendEnabled + helpDeskAutoSendUntil (expiry datetime).
 */
export async function PATCH(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? 'Invalid standby payload',
          code: 'SCHEMA',
        },
        { status: 400 }
      )
    }
    const body = parsed.data
    let data: StandbyConfig | null = null

    if (body.mode !== undefined) {
      if (!STANDBY_MODES.includes(body.mode as StandbyMode)) {
        return Response.json(
          { success: false, error: 'Invalid standby mode', code: 'SCHEMA' },
          { status: 400 }
        )
      }
      data = await setStandbyConfig({
        mode: body.mode,
        maxAutoPerHour: body.maxAutoPerHour,
        updatedBy: 'william_morrison',
      })
    }

    if (body.helpDeskAutoSendEnabled !== undefined) {
      const until =
        body.helpDeskAutoSendEnabled && body.helpDeskAutoSendUntil
          ? new Date(body.helpDeskAutoSendUntil)
          : null
      data = await setHelpDeskAutoSendPermit({
        enabled: body.helpDeskAutoSendEnabled,
        until,
        updatedBy: 'william_morrison',
      })
    } else if (body.maxAutoPerHour !== undefined && body.mode === undefined) {
      const current = await getStandbyConfig()
      data = await setStandbyConfig({
        mode: current.mode,
        maxAutoPerHour: body.maxAutoPerHour,
        updatedBy: 'william_morrison',
      })
    }

    if (!data) data = await getStandbyConfig()
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
