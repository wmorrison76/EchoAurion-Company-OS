import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { computeHealth } from '@/lib/support'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const ingestSchema = z.object({
  clientKey: z.string().min(1).max(200),
  label: z.string().max(200).optional(),
  property: z.string().max(200).optional(),
  appVersion: z.string().max(50).optional(),
  platform: z.string().max(50).optional(),
  online: z.boolean().optional(),
  queueDepth: z.number().int().min(0).max(1_000_000).optional(),
  lastSyncAt: z.string().datetime().optional(),
  errorCount: z.number().int().min(0).max(1_000_000).optional(),
  details: z.record(z.unknown()).optional(),
})

/**
 * Tier 0 ingest — the product's Electron client POSTs a passive diagnostic
 * bundle here. Authenticated with a shared bearer secret (NOT the admin
 * session), so it is excluded from the auth middleware. Disabled entirely
 * unless SUPPORT_INGEST_SECRET is set — nothing is open by default.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.SUPPORT_INGEST_SECRET
  if (!secret) {
    return Response.json(
      { success: false, error: 'Support ingest disabled', code: '503' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = ingestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid diagnostic payload' }, { status: 400 })
    }
    const d = parsed.data
    const online = d.online ?? true
    const queueDepth = d.queueDepth ?? 0
    const errorCount = d.errorCount ?? 0
    const lastSyncAt = d.lastSyncAt ? new Date(d.lastSyncAt) : null
    const health = computeHealth({ online, queueDepth, errorCount, lastSyncAt })

    const client = await db.supportClient.upsert({
      where: { clientKey: d.clientKey },
      create: {
        clientKey: d.clientKey,
        label: d.label ?? d.clientKey,
        property: d.property ?? null,
      },
      update: {
        ...(d.label ? { label: d.label } : {}),
        ...(d.property ? { property: d.property } : {}),
      },
    })

    const snapshot = await db.diagnosticSnapshot.create({
      data: {
        clientId: client.id,
        appVersion: d.appVersion ?? null,
        platform: d.platform ?? null,
        online,
        queueDepth,
        lastSyncAt,
        errorCount,
        health,
        details: (d.details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })

    await audit('computer_agent', 'support.diagnostic.ingest', client.id, { health, queueDepth })

    return Response.json(
      { success: true, data: { id: snapshot.id, health } } satisfies APIResponse<{
        id: string
        health: string
      }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Ingest failed' },
      { status: 500 }
    )
  }
}
