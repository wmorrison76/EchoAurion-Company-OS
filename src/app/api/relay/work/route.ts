import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { relayAuthorized, requireClientKey } from '@/lib/relay-auth'
import { upsertSupportClientByKey } from '@/lib/relay-heartbeat'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  kind: z.enum(['FIX', 'ADDON']).default('FIX'),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(8000),
  requesterName: z.string().max(200).optional(),
  requesterRole: z.string().max(100).optional(),
  context: z.record(z.unknown()).optional(),
})

// A customer submits a billable change request from inside support. Logged as
// RECEIVED; nothing is quoted, built, or charged until William triages it.
export async function POST(req: Request): Promise<Response> {
  const a = relayAuthorized(req)
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid work request', code: 'SCHEMA' },
        { status: 400 }
      )
    }
    const d = parsed.data
    const key = requireClientKey(d.clientKey)
    if (!key.ok) {
      return Response.json(
        { success: false, error: key.error, code: key.code },
        { status: key.status }
      )
    }
    const client = await upsertSupportClientByKey(key.clientKey)
    const created = await db.workRequest.create({
      data: {
        clientKey: key.clientKey,
        clientId: client.id,
        kind: d.kind,
        title: d.title,
        detail: d.detail,
        requesterName: d.requesterName ?? null,
        requesterRole: d.requesterRole ?? null,
        context: (d.context ?? undefined) as Prisma.InputJsonValue | undefined,
        actor: 'computer_agent',
      },
    })
    await audit('computer_agent', 'work.request.receive', created.id, { kind: d.kind })
    await raiseAlert({
      kind: 'question',
      severity: 'WARN',
      title: `New ${d.kind === 'ADDON' ? 'add-on' : 'fix'} request: ${d.title}`,
      body: `${client.clientKey}${d.requesterName ? ` — ${d.requesterName}` : ''}`,
      entityRef: created.id,
      url: '/support/inbox',
    })
    return Response.json(
      { success: true, data: { id: created.id } } satisfies APIResponse<{ id: string }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Work submit failed',
        code: 'WORK_FAILED',
      },
      { status: 500 }
    )
  }
}
