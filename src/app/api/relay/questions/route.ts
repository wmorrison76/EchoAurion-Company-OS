import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { relayAuthorized, requireClientKey } from '@/lib/relay-auth'
import { upsertSupportClientByKey } from '@/lib/relay-heartbeat'
import {
  processInboundQuestion,
  shouldAutoKnightsOnQuestion,
} from '@/lib/help-desk-knights'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  question: z.string().min(1).max(4000),
  context: z.record(z.unknown()).optional(),
})

/**
 * A deployment submits a customer question.
 * Creates CustomerQuestion + HelpTicket TEXT, then (by default) runs Knights
 * draft in the background. Standby may auto-approve low-risk TEXT only.
 */
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
        { success: false, error: 'Invalid question payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }
    const key = requireClientKey(parsed.data.clientKey)
    if (!key.ok) {
      return Response.json(
        { success: false, error: key.error, code: key.code },
        { status: key.status }
      )
    }
    const { question, context } = parsed.data
    const client = await upsertSupportClientByKey(key.clientKey)
    const created = await db.customerQuestion.create({
      data: {
        clientKey: key.clientKey,
        clientId: client.id,
        question,
        context: (context ?? undefined) as Prisma.InputJsonValue | undefined,
        actor: 'computer_agent',
      },
    })
    await audit('computer_agent', 'support.question.receive', created.id)

    const autoKnights = shouldAutoKnightsOnQuestion()

    // Return quickly; ticket + Knights run async so Render/pilot don't time out.
    void processInboundQuestion(created.id)
      .then((r) => {
        if (!autoKnights) return
        console.info(
          `[relay/questions] processed ${created.id} → ticket ${r.ticketId} knights=${r.knightsRan} auto=${r.autoApproved}`
        )
      })
      .catch((err) => {
        console.error('[relay/questions] processInboundQuestion failed', err)
        void raiseAlert({
          kind: 'question',
          severity: 'ERROR',
          title: 'Inbound question processing failed',
          body: question.slice(0, 140),
          entityRef: created.id,
          url: '/help-desk',
        })
      })

    // Immediate inbox alert (Help Desk ticket may still be creating)
    await raiseAlert({
      kind: 'question',
      severity: 'WARN',
      title: autoKnights
        ? 'New customer question — Knights drafting'
        : 'New customer question',
      body: question.slice(0, 140),
      entityRef: created.id,
      url: '/support/inbox',
    })

    return Response.json(
      {
        success: true,
        data: {
          id: created.id,
          autoKnights,
        },
      } satisfies APIResponse<{ id: string; autoKnights: boolean }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Question submit failed',
        code: 'QUESTION_FAILED',
      },
      { status: 500 }
    )
  }
}
