import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { relayAuthorized } from '@/lib/relay-auth'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  question: z.string().min(1).max(4000),
  context: z.record(z.unknown()).optional(),
})

// A deployment submits a customer question. Stored as NEW; William drafts +
// approves an answer; the deployment pulls it back. The product stays hidden —
// we only ever see the opaque clientKey.
export async function POST(req: Request): Promise<Response> {
  const a = relayAuthorized(req)
  if (!a.ok) return Response.json({ success: false, error: a.error }, { status: a.status })
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid question payload' }, { status: 400 })
    }
    const { clientKey, question, context } = parsed.data
    const client = await db.supportClient.findUnique({ where: { clientKey } })
    const created = await db.customerQuestion.create({
      data: {
        clientKey,
        clientId: client?.id ?? null,
        question,
        context: (context ?? undefined) as Prisma.InputJsonValue | undefined,
        actor: 'computer_agent',
      },
    })
    await audit('computer_agent', 'support.question.receive', created.id)
    await raiseAlert({
      kind: 'question',
      severity: 'WARN',
      title: 'New customer question',
      body: question.slice(0, 140),
      entityRef: created.id,
      url: '/support',
    })
    return Response.json(
      { success: true, data: { id: created.id } } satisfies APIResponse<{ id: string }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Question submit failed' },
      { status: 500 }
    )
  }
}
