import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'
import type { RaiseTracker } from '@/types/revenue'

export const dynamic = 'force-dynamic'

function toTracker(c: {
  target: number
  committed: number
  conversations: number
}): RaiseTracker {
  return { ...c, pct: c.target > 0 ? c.committed / c.target : 0 }
}

async function current() {
  let cfg = await db.raiseConfig.findFirst()
  if (!cfg) cfg = await db.raiseConfig.create({ data: {} })
  return cfg
}

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const cfg = await current()
    return Response.json({ success: true, data: toTracker(cfg) } satisfies APIResponse<RaiseTracker>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Raise read failed' },
      { status: 500 }
    )
  }
}

const schema = z.object({
  target: z.number().nonnegative().optional(),
  committed: z.number().nonnegative().optional(),
  conversations: z.number().int().nonnegative().optional(),
})

// Update via admin panel (CLAUDE.md §14.4), single-row upsert pattern.
export async function PUT(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid payload' }, { status: 400 })
    }
    const cfg = await current()
    const updated = await db.raiseConfig.update({ where: { id: cfg.id }, data: parsed.data })
    await audit('william_morrison', 'revenue.raise.update', updated.id, parsed.data)
    return Response.json({ success: true, data: toTracker(updated) } satisfies APIResponse<RaiseTracker>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Raise update failed' },
      { status: 500 }
    )
  }
}
