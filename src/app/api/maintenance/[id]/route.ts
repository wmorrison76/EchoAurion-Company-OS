import { z } from 'zod'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { toMaintenanceView } from '@/lib/maintenance'
import type { APIResponse } from '@/types'
import type { MaintenanceNoticeView } from '@/types/maintenance'
import {
  MAINTENANCE_SEVERITIES,
  MAINTENANCE_TARGET_SCOPES,
} from '@/types/maintenance'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(8000).optional(),
  severity: z.enum(MAINTENANCE_SEVERITIES).optional(),
  targetScope: z.enum(MAINTENANCE_TARGET_SCOPES).optional(),
  targetValue: z.string().max(200).nullable().optional(),
  windowStart: z.string().datetime().nullable().optional(),
  windowEnd: z.string().datetime().nullable().optional(),
})

type RouteCtx = { params: { id: string } }

export async function GET(_req: Request, { params }: RouteCtx): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const row = await db.maintenanceNotice.findUnique({ where: { id: params.id } })
    if (!row) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    return Response.json({
      success: true,
      data: toMaintenanceView(row),
    } satisfies APIResponse<MaintenanceNoticeView>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Get failed' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request, { params }: RouteCtx): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const existing = await db.maintenanceNotice.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    if (existing.status === 'SENT' || existing.status === 'CANCELLED') {
      return Response.json(
        { success: false, error: `Cannot edit a ${existing.status.toLowerCase()} notice` },
        { status: 400 }
      )
    }

    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 }
      )
    }

    const d = parsed.data
    const nextScope = d.targetScope ?? (existing.targetScope as (typeof MAINTENANCE_TARGET_SCOPES)[number])
    const nextValue =
      d.targetValue !== undefined
        ? d.targetValue
        : existing.targetValue

    if (nextScope !== 'ALL' && !nextValue?.trim()) {
      return Response.json(
        { success: false, error: 'targetValue is required for CLIENT_KEY or PROPERTY scope' },
        { status: 400 }
      )
    }

    const updated = await db.maintenanceNotice.update({
      where: { id: params.id },
      data: {
        ...(d.title !== undefined ? { title: d.title.trim() } : {}),
        ...(d.body !== undefined ? { body: d.body.trim() } : {}),
        ...(d.severity !== undefined ? { severity: d.severity } : {}),
        ...(d.targetScope !== undefined ? { targetScope: d.targetScope } : {}),
        ...(d.targetValue !== undefined || d.targetScope !== undefined
          ? {
              targetValue:
                nextScope === 'ALL' ? null : nextValue?.trim() || null,
            }
          : {}),
        ...(d.windowStart !== undefined
          ? { windowStart: d.windowStart ? new Date(d.windowStart) : null }
          : {}),
        ...(d.windowEnd !== undefined
          ? { windowEnd: d.windowEnd ? new Date(d.windowEnd) : null }
          : {}),
      },
    })

    await audit('william_morrison', 'maintenance.notice.update', updated.id)

    return Response.json({
      success: true,
      data: toMaintenanceView(updated),
    } satisfies APIResponse<MaintenanceNoticeView>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(_req: Request, { params }: RouteCtx): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const existing = await db.maintenanceNotice.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    if (existing.status === 'SENT') {
      return Response.json(
        { success: false, error: 'Cannot delete a sent notice — keep for history' },
        { status: 400 }
      )
    }

    await db.maintenanceNotice.delete({ where: { id: params.id } })
    await audit('william_morrison', 'maintenance.notice.delete', params.id)

    return Response.json({
      success: true,
      data: { id: params.id },
    } satisfies APIResponse<{ id: string }>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    )
  }
}
