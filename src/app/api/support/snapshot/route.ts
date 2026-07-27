import { z } from 'zod'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import {
  buildAnonymizedSnapshot,
  persistSystemSnapshot,
  SNAPSHOT_ALLOWED_FIELDS,
  SNAPSHOT_FORBIDDEN_FIELDS,
  type AnonymizedSystemSnapshot,
} from '@/lib/system-snapshot'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/support/snapshot — anonymized health (auth).
 * No guest/PII fields. See docs/SECURITY_RELAY.md.
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const snapshot = await buildAnonymizedSnapshot()
    const recent = await db.systemSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, health: true, source: true, sentToKnights: true, createdAt: true },
    })
    return Response.json({
      success: true,
      data: {
        snapshot,
        recent: recent.map((r) => ({
          id: r.id,
          health: r.health,
          source: r.source,
          sentToKnights: r.sentToKnights,
          createdAt: r.createdAt.toISOString(),
        })),
        fields: {
          allowed: SNAPSHOT_ALLOWED_FIELDS,
          forbidden: SNAPSHOT_FORBIDDEN_FIELDS,
        },
      },
    } satisfies APIResponse<{
      snapshot: AnonymizedSystemSnapshot
      recent: Array<{
        id: string
        health: string
        source: string
        sentToKnights: boolean
        createdAt: string
      }>
      fields: { allowed: readonly string[]; forbidden: readonly string[] }
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Snapshot failed',
      },
      { status: 500 }
    )
  }
}

const postSchema = z.object({
  sendToKnights: z.boolean().optional(),
  source: z.string().max(40).optional(),
})

/**
 * POST /api/support/snapshot — capture + persist SystemSnapshot.
 * Optional sendToKnights stores Board Room sandbox briefing (no PII).
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid body', code: 'SCHEMA' }, { status: 400 })
    }
    const { id, snapshot } = await persistSystemSnapshot({
      actor: 'william_morrison',
      source: parsed.data.source ?? 'operator',
      sendToKnights: parsed.data.sendToKnights,
    })
    await audit('william_morrison', 'support.snapshot.capture', id, {
      health: snapshot.health,
      sentToKnights: Boolean(parsed.data.sendToKnights),
    })
    return Response.json(
      { success: true, data: { id, snapshot } } satisfies APIResponse<{
        id: string
        snapshot: AnonymizedSystemSnapshot
      }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Snapshot capture failed',
      },
      { status: 500 }
    )
  }
}
