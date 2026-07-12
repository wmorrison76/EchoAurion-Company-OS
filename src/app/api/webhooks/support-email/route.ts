import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { parseIntakeGate, gateFromQuestionPayload } from '@/lib/intake-gate'
import { slaDueFieldsForCreate } from '@/lib/help-desk'
import { processInboundQuestion } from '@/lib/help-desk-knights'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * Email → HelpTicket intake (omnichannel lite).
 * Auth: SUPPORT_EMAIL_WEBHOOK_SECRET or SUPPORT_INGEST_SECRET Bearer.
 * Feature-flagged: disabled in production until secret is set.
 * Never store raw From email on the ticket — hash/redact to clientKey hint.
 *
 * See docs/SUPPORT_90_DAY_PLAN.md
 */

const schema = z.object({
  subject: z.string().min(1).max(500),
  text: z.string().min(1).max(20_000),
  gate: z.string().optional(),
  intakeGate: z.string().optional(),
  clientKey: z.string().optional(),
  /** Opaque sender hint — never store raw email. */
  fromDomain: z.string().optional(),
  fromHash: z.string().optional(),
  messageId: z.string().optional(),
})

function emailAuthorized(req: Request): boolean {
  const secret =
    process.env.SUPPORT_EMAIL_WEBHOOK_SECRET?.trim() ||
    process.env.SUPPORT_INGEST_SECRET?.trim()
  if (!secret) {
    return process.env.NODE_ENV !== 'production'
  }
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return Boolean(match && match[1] === secret)
}

function redactClientKey(fromHash: string | undefined, explicit: string | undefined): string {
  if (explicit?.trim()) return explicit.trim().slice(0, 120)
  if (fromHash?.trim()) return `email:${fromHash.trim().slice(0, 16)}`
  return 'email:unknown'
}

export async function POST(req: Request): Promise<Response> {
  if (!emailAuthorized(req)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  try {
    const raw = (await req.json()) as Record<string, unknown>
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid email payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }

    const gate =
      parseIntakeGate(parsed.data.gate) ??
      parseIntakeGate(parsed.data.intakeGate) ??
      gateFromQuestionPayload({
        gate: parsed.data.gate,
        intakeGate: parsed.data.intakeGate,
        context: null,
      }) ??
      'OTHER'

    const clientKey = redactClientKey(parsed.data.fromHash, parsed.data.clientKey)
    const question = `${parsed.data.subject}\n\n${parsed.data.text}`.slice(0, 4000)
    const now = new Date()
    const dues = slaDueFieldsForCreate(now, gate)

    const created = await db.customerQuestion.create({
      data: {
        clientKey,
        question,
        intakeGate: gate,
        context: {
          channel: 'email',
          messageId: parsed.data.messageId ?? null,
          from: 'redacted',
          gate,
        } as Prisma.InputJsonValue,
        actor: 'computer_agent',
      },
    })

    const ticket = await db.helpTicket.create({
      data: {
        channel: 'TEXT',
        intakeChannel: 'EMAIL',
        intakeGate: gate,
        status: 'OPEN',
        subject: parsed.data.subject.slice(0, 120),
        clientKey,
        customerQuestionId: created.id,
        firstResponseDueAt: dues.firstResponseDueAt,
        resolveDueAt: dues.resolveDueAt,
        messages: {
          create: [{ role: 'CUSTOMER', body: question }],
        },
      },
    })

    await audit('computer_agent', 'support.email.intake', ticket.id, {
      gate,
      // no PII
    })

    if (gate === 'TECH' || gate === 'OTHER') {
      void processInboundQuestion(created.id).catch((err) => {
        console.error('[support-email] processInboundQuestion failed', err)
      })
    }

    return Response.json(
      {
        success: true,
        data: {
          ticketId: ticket.id,
          questionId: created.id,
          gate,
          intakeChannel: 'EMAIL',
        },
      } satisfies APIResponse<{
        ticketId: string
        questionId: string
        gate: string
        intakeChannel: string
      }>,
      { status: 201 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Email ingest failed',
        code: 'EMAIL_FAILED',
      },
      { status: 500 }
    )
  }
}

export async function GET(): Promise<Response> {
  return Response.json({
    success: true,
    data: {
      endpoint: '/api/webhooks/support-email',
      auth: 'Bearer SUPPORT_EMAIL_WEBHOOK_SECRET or SUPPORT_INGEST_SECRET',
      fields: ['subject', 'text', 'gate?', 'clientKey?', 'fromHash?', 'messageId?'],
      docs: 'docs/SUPPORT_90_DAY_PLAN.md',
    },
  })
}
