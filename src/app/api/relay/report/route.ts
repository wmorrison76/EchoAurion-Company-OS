import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { relayAuthorized } from '@/lib/relay-auth'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  label: z.string().max(200).optional(),
  property: z.string().max(200).optional(),
  topic: z.string().min(1).max(200),
  note: z.string().max(2000).optional(),
})

// "Report a problem" from a deployment — opens a support session and pings
// William. Diagnostics flow through /api/support/diagnostics separately.
export async function POST(req: Request): Promise<Response> {
  const a = relayAuthorized(req)
  if (!a.ok) return Response.json({ success: false, error: a.error }, { status: a.status })
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid report payload' }, { status: 400 })
    }
    const { clientKey, label, property, topic, note } = parsed.data
    const client = await db.supportClient.upsert({
      where: { clientKey },
      create: { clientKey, label: label ?? clientKey, property: property ?? null },
      update: {
        ...(label ? { label } : {}),
        ...(property ? { property } : {}),
      },
    })
    const session = await db.supportSession.create({
      data: { clientId: client.id, topic, notes: note ?? null, actor: 'computer_agent' },
    })
    await audit('computer_agent', 'support.report.create', session.id, { topic })
    await raiseAlert({
      kind: 'report',
      severity: 'CRITICAL',
      title: `Problem reported: ${topic}`,
      body: `${client.label}${note ? ` — ${note.slice(0, 120)}` : ''}`,
      entityRef: session.id,
      url: '/support',
    })
    return Response.json(
      { success: true, data: { id: session.id } } satisfies APIResponse<{ id: string }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Report failed' },
      { status: 500 }
    )
  }
}
