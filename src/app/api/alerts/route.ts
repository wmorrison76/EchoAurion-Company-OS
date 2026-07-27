import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'
import type { AlertSeverity, AlertView } from '@/types/support'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const alerts = await db.alert.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
    const data: AlertView[] = alerts.map((a) => ({
      id: a.id,
      kind: a.kind,
      severity: a.severity as AlertSeverity,
      title: a.title,
      body: a.body,
      read: a.read,
      createdAt: a.createdAt.toISOString(),
    }))
    return Response.json({ success: true, data } satisfies APIResponse<AlertView[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Alerts query failed' },
      { status: 500 }
    )
  }
}
