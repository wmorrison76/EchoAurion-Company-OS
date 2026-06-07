import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'
import type { ComplexityTier } from '@/lib/pricing'
import type { WorkKind, WorkRequestView, WorkStatus } from '@/types/work'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const items = await db.workRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
    const clientIds = [...new Set(items.map((i) => i.clientId).filter(Boolean))] as string[]
    const clients = clientIds.length
      ? await db.supportClient.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, label: true },
        })
      : []
    const labelById = new Map(clients.map((c) => [c.id, c.label]))

    const data: WorkRequestView[] = items.map((w) => ({
      id: w.id,
      clientKey: w.clientKey,
      clientLabel: w.clientId ? labelById.get(w.clientId) ?? null : null,
      kind: w.kind as WorkKind,
      title: w.title,
      detail: w.detail,
      requesterName: w.requesterName,
      requesterRole: w.requesterRole,
      tier: (w.tier as ComplexityTier | null) ?? null,
      humanHours: w.humanHours,
      quoteTotal: w.quoteTotal,
      draftSeat: w.draftSeat,
      draftPlan: w.draftPlan,
      approvedByCustomer: w.approvedByCustomer,
      customerApprover: w.customerApprover,
      approvedByAdmin: w.approvedByAdmin,
      rollbackRef: w.rollbackRef,
      status: w.status as WorkStatus,
      createdAt: w.createdAt.toISOString(),
    }))
    return Response.json({ success: true, data } satisfies APIResponse<WorkRequestView[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Work query failed' },
      { status: 500 }
    )
  }
}
