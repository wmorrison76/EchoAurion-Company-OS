import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * Dead-letter / failed notify queue visibility.
 * GET /api/help-desk/dead-letter
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const jobs = await db.ingestJob.findMany({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })

    const data = jobs.map((j) => ({
      id: j.id,
      kind: j.kind,
      attempts: j.attempts,
      lastError: j.lastError,
      payload: j.payload,
      updatedAt: j.updatedAt.toISOString(),
      createdAt: j.createdAt.toISOString(),
      shape: '✕',
      label: 'Failed',
    }))

    return Response.json({
      success: true,
      data: { count: data.length, jobs: data },
      meta: { lastUpdated: new Date().toISOString() },
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Dead-letter list failed',
      },
      { status: 500 }
    )
  }
}

/** POST — re-queue a FAILED job (reset to PENDING). */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { id?: string }
    if (!body.id) {
      return Response.json({ success: false, error: 'id required' }, { status: 400 })
    }
    const updated = await db.ingestJob.update({
      where: { id: body.id },
      data: {
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        runAfter: new Date(),
        lockedAt: null,
      },
    })
    return Response.json({
      success: true,
      data: { id: updated.id, status: updated.status },
    } satisfies APIResponse<{ id: string; status: string }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Re-queue failed',
      },
      { status: 500 }
    )
  }
}
