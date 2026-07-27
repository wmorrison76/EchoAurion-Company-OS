import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { convene } from '@/lib/board-room/session'
import { KNIGHT_SEATS } from '@/lib/board-room/knights'
import { applyPersona } from '@/lib/board-room/personas'
import type { APIResponse } from '@/types'
import type { BoardRoomSessionSummary, SessionStatus } from '@/types/board-room'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const rows = await db.boardRoomSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { responses: true },
    })
    const data: BoardRoomSessionSummary[] = rows.map((r) => ({
      id: r.id,
      problem: r.problem,
      sandbox: r.sandbox,
      status: r.status as SessionStatus,
      createdAt: r.createdAt.toISOString(),
      knightCount: r.responses.length,
      respondedCount: r.responses.filter((x) => x.status === 'RESPONDED').length,
    }))
    return Response.json({ success: true, data } satisfies APIResponse<BoardRoomSessionSummary[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'List failed' },
      { status: 500 }
    )
  }
}

const schema = z.object({
  problem: z.string().min(8, 'Describe the problem in a sentence or two'),
  sandbox: z.boolean().default(false),
  // Phase 5 — Playground persona (sandbox only).
  persona: z.string().optional(),
})

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
    if (KNIGHT_SEATS.length === 0) {
      return Response.json({ success: false, error: 'No knights configured' }, { status: 503 })
    }

    // Persona framing only applies to sandbox (Playground) sessions.
    const problem =
      parsed.data.sandbox && parsed.data.persona
        ? applyPersona(parsed.data.problem, parsed.data.persona)
        : parsed.data.problem
    const id = await convene(problem, parsed.data.sandbox, 'william_morrison')
    return Response.json({ success: true, data: { id } } satisfies APIResponse<{ id: string }>, {
      status: 201,
    })
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Convene failed' },
      { status: 500 }
    )
  }
}
