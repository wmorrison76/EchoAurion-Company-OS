import { z } from 'zod'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { dispatchArchitect } from '@/lib/board-room/architect'
import type { APIResponse } from '@/types'
import type { ArchitectDispatch } from '@/lib/board-room/architect'

export const dynamic = 'force-dynamic'

const schema = z.object({
  task: z.string().min(8, 'Describe the task'),
  ref: z.string().optional(),
})

// Phase 2 — hand a task to the Architect (Claude Code) via workflow_dispatch.
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }
    const result = await dispatchArchitect(parsed.data.task, parsed.data.ref)
    await audit('william_morrison', 'board_room.architect.dispatch', undefined, {
      dispatched: result.dispatched,
    })
    return Response.json({ success: true, data: result } satisfies APIResponse<ArchitectDispatch>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Dispatch failed' },
      { status: 500 }
    )
  }
}
