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

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
  severity: z.enum(MAINTENANCE_SEVERITIES).default('INFO'),
  targetScope: z.enum(MAINTENANCE_TARGET_SCOPES).default('ALL'),
  targetValue: z.string().max(200).nullable().optional(),
  windowStart: z.string().datetime().nullable().optional(),
  windowEnd: z.string().datetime().nullable().optional(),
})

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const rows = await db.maintenanceNotice.findMany({
      orderBy: [{ status: 'asc' }, { scheduledFor: 'desc' }, { createdAt: 'desc' }],
    })
    return Response.json({
      success: true,
      data: rows.map(toMaintenanceView),
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<MaintenanceNoticeView[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'List failed' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 }
      )
    }

    const d = parsed.data
    if (d.targetScope !== 'ALL' && !d.targetValue?.trim()) {
      return Response.json(
        { success: false, error: 'targetValue is required for CLIENT_KEY or PROPERTY scope' },
        { status: 400 }
      )
    }

    const created = await db.maintenanceNotice.create({
      data: {
        title: d.title.trim(),
        body: d.body.trim(),
        severity: d.severity,
        targetScope: d.targetScope,
        targetValue: d.targetScope === 'ALL' ? null : d.targetValue?.trim() || null,
        windowStart: d.windowStart ? new Date(d.windowStart) : null,
        windowEnd: d.windowEnd ? new Date(d.windowEnd) : null,
        status: 'DRAFT',
        createdBy: 'william_morrison',
      },
    })

    await audit('william_morrison', 'maintenance.notice.create', created.id, {
      title: created.title,
      targetScope: created.targetScope,
    })

    return Response.json({
      success: true,
      data: toMaintenanceView(created),
    } satisfies APIResponse<MaintenanceNoticeView>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Create failed' },
      { status: 500 }
    )
  }
}
