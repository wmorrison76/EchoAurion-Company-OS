import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * Knight seat "which seat helped" counters for prompt tuning.
 * GET /api/board-room/seat-counters
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const days = Number(new URL(req.url).searchParams.get('days') ?? '30')
    const since = new Date(
      Date.now() - (Number.isFinite(days) ? Math.min(Math.max(days, 1), 90) : 30) * 86400000
    )

    const msgs = await db.helpMessage.findMany({
      where: {
        role: 'KNIGHT',
        createdAt: { gte: since },
        seat: { not: null },
      },
      select: { seat: true },
    })

    const counts: Record<string, number> = {}
    for (const m of msgs) {
      const s = m.seat!.trim() || 'unknown'
      counts[s] = (counts[s] ?? 0) + 1
    }

    const seats = Object.entries(counts)
      .map(([seat, count]) => ({
        seat,
        count,
        shape: count >= 20 ? '■' : count >= 5 ? '▲' : '●',
        label: count >= 20 ? 'Heavy use' : count >= 5 ? 'Active' : 'Light',
      }))
      .sort((a, b) => b.count - a.count)

    return Response.json({
      success: true,
      data: { seats, total: msgs.length, since: since.toISOString() },
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<{
      seats: Array<{ seat: string; count: number; shape: string; label: string }>
      total: number
      since: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Seat counters failed',
      },
      { status: 500 }
    )
  }
}
