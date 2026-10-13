import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { allocateGapRDCosts } from '@/lib/gap-rd-cost-allocation'

export const dynamic = 'force-dynamic'

const schema = z.object({
  usageIds: z.array(z.string().min(1).max(128)).min(1).max(200),
  shares: z.array(z.object({
    usageId: z.string().min(1).max(128),
    workRequestId: z.string().min(1).max(128),
    basisPoints: z.number().int().min(1).max(10_000),
  }).strict()).min(1).max(200),
  glAccount: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/).nullable().optional(),
}).strict()

/**
 * Operator-only PREVIEW. Uses actual AiUsageEvent rows, rejects customer
 * inference charges and unrecognized R&D jobs. No GL journal, expense entry,
 * bank mutation, quote, customer bill or posting occurs here.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'dr_os' || session.user.id !== 'william_morrison') {
    return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let input: z.infer<typeof schema>
  try {
    const raw = await req.text()
    if (raw.length > 40_000) return Response.json({ success: false, error: 'Too large' }, { status: 413 })
    const parsed = schema.safeParse(JSON.parse(raw))
    if (!parsed.success) return Response.json({ success: false, error: 'Invalid R&D preview input' }, { status: 400 })
    input = parsed.data
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const ids = [...new Set(input.usageIds)]
  if (ids.length !== input.usageIds.length) {
    return Response.json({ success: false, error: 'Duplicate usage ID' }, { status: 400 })
  }
  const workIds = [...new Set(input.shares.map(s => s.workRequestId))]
  try {
    const [events, work] = await Promise.all([
      db.aiUsageEvent.findMany({ where: { id: { in: ids } } }),
      db.workRequest.findMany({ where: { id: { in: workIds } }, select: { id: true, context: true } }),
    ])
    if (events.length !== ids.length) {
      return Response.json({ success: false, error: 'Metering evidence unavailable' }, { status: 404 })
    }
    if (events.some(e => e.clientKey !== null)) {
      return Response.json({ success: false, error: 'Customer inference costs cannot be charged to internal R&D' }, { status: 403 })
    }
    const confirmed = new Set(work.filter(w => {
      const ctx = w.context
      if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return false
      const rd = (ctx as Record<string, unknown>).rAndD
      return !!rd && typeof rd === 'object' && !Array.isArray(rd) &&
        (rd as Record<string, unknown>).costClassification === 'INTERNAL_RD'
    }).map(w => w.id))
    if (workIds.some(id => !confirmed.has(id))) {
      return Response.json({ success: false, error: 'R&D work request scope not verified' }, { status: 403 })
    }

    const preview = allocateGapRDCosts({
      usage: events.map(e => ({
        id: e.id, provider: e.provider, model: e.model,
        costUsd: e.costUsd, estimated: e.estimated,
      })),
      shares: input.shares,
      glAccount: input.glAccount,
    })
    return Response.json({
      success: true,
      data: {
        ...preview,
        note: 'Internal R&D draft only. Verify provider bills and controller-selected GL before any accounting posting.',
      },
    })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('RD_')) {
      return Response.json({ success: false, error: err.message }, { status: 400 })
    }
    return Response.json({ success: false, error: 'R&D cost preview unavailable' }, { status: 503 })
  }
}
