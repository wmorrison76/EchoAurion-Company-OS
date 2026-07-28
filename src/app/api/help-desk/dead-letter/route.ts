import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * Dead-letter + stuck outbox visibility.
 * GET /api/help-desk/dead-letter
 *   ?kind=ingest|outbox|all (default all)
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const kind = new URL(req.url).searchParams.get('kind') ?? 'all'
    const stuckCutoff = new Date(Date.now() - 5 * 60_000)

    const [jobs, stuckOutbox] = await Promise.all([
      kind === 'outbox'
        ? Promise.resolve([])
        : db.ingestJob.findMany({
            where: { status: 'FAILED' },
            orderBy: { updatedAt: 'desc' },
            take: 50,
          }),
      kind === 'ingest'
        ? Promise.resolve([])
        : db.relayOutbox.findMany({
            where: {
              deliveredAt: null,
              createdAt: { lt: stuckCutoff },
            },
            orderBy: { createdAt: 'asc' },
            take: 50,
          }),
    ])

    const data = {
      ingestJobs: jobs.map((j) => ({
        id: j.id,
        kind: j.kind,
        attempts: j.attempts,
        lastError: j.lastError,
        // Scrub payload — never return raw PII to analytics panels
        payloadKeys:
          j.payload && typeof j.payload === 'object' && !Array.isArray(j.payload)
            ? Object.keys(j.payload as object).slice(0, 12)
            : [],
        updatedAt: j.updatedAt.toISOString(),
        createdAt: j.createdAt.toISOString(),
        shape: '✕' as const,
        label: 'Failed ingest',
      })),
      stuckOutbox: stuckOutbox.map((o) => ({
        id: o.id,
        clientKey: o.clientKey,
        type: o.type,
        createdAt: o.createdAt.toISOString(),
        ageMinutes: Math.round((Date.now() - o.createdAt.getTime()) / 60_000),
        shape: '▲' as const,
        label: 'Stuck outbox',
      })),
      counts: {
        failedIngest: jobs.length,
        stuckOutbox: stuckOutbox.length,
      },
    }

    return Response.json({
      success: true,
      data,
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

/**
 * POST — retry actions:
 * { action: 'requeue_ingest', id }
 * { action: 'republish_outbox', id } — clone fresh + ack original (no stuck duplicate)
 * { action: 'mark_outbox_delivered', id } — operator ack when manually confirmed
 * { action: 'ack_all_stuck_outbox' } — mark all stuck undelivered rows delivered
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      id?: string
      action?:
        | 'requeue_ingest'
        | 'republish_outbox'
        | 'mark_outbox_delivered'
        | 'ack_all_stuck_outbox'
    }

    // Back-compat: { id } alone → requeue ingest
    const action = body.action ?? 'requeue_ingest'

    if (action === 'ack_all_stuck_outbox') {
      const stuckCutoff = new Date(Date.now() - 5 * 60_000)
      const result = await db.relayOutbox.updateMany({
        where: {
          deliveredAt: null,
          createdAt: { lt: stuckCutoff },
        },
        data: { deliveredAt: new Date() },
      })
      await audit('william_morrison', 'help_desk.outbox.ack_all', undefined, {
        count: result.count,
      })
      return Response.json({
        success: true,
        data: { id: 'all', status: 'DELIVERED', action, count: result.count },
      })
    }

    if (!body.id) {
      return Response.json({ success: false, error: 'id required' }, { status: 400 })
    }

    if (action === 'requeue_ingest') {
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
      await audit('william_morrison', 'help_desk.dead_letter.requeue', updated.id, {
        kind: updated.kind,
      })
      return Response.json({
        success: true,
        data: { id: updated.id, status: updated.status, action },
      } satisfies APIResponse<{ id: string; status: string; action: string }>)
    }

    if (action === 'republish_outbox') {
      const row = await db.relayOutbox.findUnique({ where: { id: body.id } })
      if (!row) {
        return Response.json({ success: false, error: 'Outbox row not found' }, { status: 404 })
      }
      // Clone as fresh undelivered event, then ack the stale original so count drops.
      const fresh = await db.relayOutbox.create({
        data: {
          clientKey: row.clientKey,
          type: row.type,
          payload: row.payload ?? {},
        },
      })
      if (!row.deliveredAt) {
        await db.relayOutbox.update({
          where: { id: row.id },
          data: { deliveredAt: new Date() },
        })
      }
      await audit('william_morrison', 'help_desk.outbox.republish', fresh.id, {
        fromId: row.id,
        clientKey: row.clientKey,
        type: row.type,
      })
      return Response.json({
        success: true,
        data: { id: fresh.id, status: 'PENDING', action, fromId: row.id },
      })
    }

    if (action === 'mark_outbox_delivered') {
      const updated = await db.relayOutbox.update({
        where: { id: body.id },
        data: { deliveredAt: new Date() },
      })
      await audit('william_morrison', 'help_desk.outbox.ack', updated.id, {
        clientKey: updated.clientKey,
      })
      return Response.json({
        success: true,
        data: { id: updated.id, status: 'DELIVERED', action },
      })
    }

    return Response.json({ success: false, error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Retry failed',
      },
      { status: 500 }
    )
  }
}
