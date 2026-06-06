import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'
import type { AuditEntry } from '@/types/dr-os'

export const dynamic = 'force-dynamic'

// Last 50 audit-log entries (CLAUDE.md §10.3).
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const rows = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const data: AuditEntry[] = rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      entityId: r.entityId,
      createdAt: r.createdAt.toISOString(),
    }))
    const body: APIResponse<AuditEntry[]> = {
      success: true,
      data,
      meta: { lastUpdated: new Date().toISOString() },
    }
    return Response.json(body)
  } catch (error) {
    const body: APIResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Audit query failed',
    }
    return Response.json(body, { status: 500 })
  }
}
