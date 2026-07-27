import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { parseIntakeGate, gateFromQuestionPayload } from '@/lib/intake-gate'
import { slaDueFieldsForCreate } from '@/lib/help-desk'
import { processInboundQuestion } from '@/lib/help-desk-knights'
import { sendSupportStatusSms, statusSmsBody, twilioMessagingConfigured } from '@/lib/support-sms'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * SMS → HelpTicket intake + optional outbound status (omnichannel lite).
 * Auth: SUPPORT_SMS_WEBHOOK_SECRET or SUPPORT_INGEST_SECRET Bearer.
 * Feature-flagged: disabled in production until secret is set.
 * Never store raw phone on the ticket — hash/redact to clientKey hint.
 *
 * See docs/SUPPORT_SMS.md
 */

const inboundSchema = z.object({
  text: z.string().min(1).max(1600),
  gate: z.string().optional(),
  intakeGate: z.string().optional(),
  clientKey: z.string().optional(),
  /** Opaque sender hint — never store raw E.164 on ticket. */
  fromHash: z.string().optional(),
  messageSid: z.string().optional(),
})

const statusSchema = z.object({
  action: z.literal('status'),
  toE164: z.string().min(8).max(20),
  ticketId: z.string().min(1),
  status: z.string().min(1).max(40),
  subject: z.string().optional(),
  clientKey: z.string().optional(),
})

function smsAuthorized(req: Request): boolean {
  const secret =
    process.env.SUPPORT_SMS_WEBHOOK_SECRET?.trim() ||
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
  if (fromHash?.trim()) return `sms:${fromHash.trim().slice(0, 16)}`
  return 'sms:unknown'
}

export async function POST(req: Request): Promise<Response> {
  if (!smsAuthorized(req)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  try {
    const raw = (await req.json()) as Record<string, unknown>

    // Outbound status path (Twilio Messaging when configured; else stub).
    if (raw.action === 'status') {
      const parsed = statusSchema.safeParse(raw)
      if (!parsed.success) {
        return Response.json(
          { success: false, error: 'Invalid status payload', code: 'SCHEMA' },
          { status: 400 }
        )
      }
      const result = await sendSupportStatusSms({
        toE164: parsed.data.toE164,
        body: statusSmsBody({
          ticketId: parsed.data.ticketId,
          status: parsed.data.status,
          subject: parsed.data.subject,
        }),
        ticketId: parsed.data.ticketId,
        clientKey: parsed.data.clientKey,
        actor: 'computer_agent',
      })
      return Response.json({
        success: result.ok,
        data: {
          ...result,
          twilioConfigured: twilioMessagingConfigured(),
        },
        ...(result.ok
          ? {}
          : { error: result.error ?? 'SMS failed', code: 'SMS_FAILED' }),
      })
    }

    const parsed = inboundSchema.safeParse(raw)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid SMS payload', code: 'SCHEMA' },
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
    const question = parsed.data.text.slice(0, 4000)
    const now = new Date()
    const dues = slaDueFieldsForCreate(now, gate)

    const created = await db.customerQuestion.create({
      data: {
        clientKey,
        question,
        intakeGate: gate,
        context: {
          channel: 'sms',
          messageSid: parsed.data.messageSid ?? null,
          from: 'redacted',
          gate,
        } as Prisma.InputJsonValue,
        actor: 'computer_agent',
      },
    })

    const ticket = await db.helpTicket.create({
      data: {
        channel: 'TEXT',
        intakeChannel: 'SMS',
        intakeGate: gate,
        status: 'OPEN',
        subject: question.slice(0, 80),
        clientKey,
        customerQuestionId: created.id,
        firstResponseDueAt: dues.firstResponseDueAt,
        resolveDueAt: dues.resolveDueAt,
        messages: {
          create: [{ role: 'CUSTOMER', body: question }],
        },
      },
    })

    await audit('computer_agent', 'support.sms.intake', ticket.id, { gate })

    if (gate === 'TECH' || gate === 'OTHER') {
      void processInboundQuestion(created.id).catch((err) => {
        console.error('[support-sms] processInboundQuestion failed', err)
      })
    }

    return Response.json(
      {
        success: true,
        data: {
          ticketId: ticket.id,
          questionId: created.id,
          gate,
          intakeChannel: 'SMS',
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
        error: error instanceof Error ? error.message : 'SMS ingest failed',
        code: 'SMS_FAILED',
      },
      { status: 500 }
    )
  }
}

export async function GET(): Promise<Response> {
  return Response.json({
    success: true,
    data: {
      endpoint: '/api/webhooks/support-sms',
      auth: 'Bearer SUPPORT_SMS_WEBHOOK_SECRET or SUPPORT_INGEST_SECRET',
      inbound: ['text', 'gate?', 'clientKey?', 'fromHash?', 'messageSid?'],
      outboundStatus: {
        action: 'status',
        fields: ['toE164', 'ticketId', 'status', 'subject?', 'clientKey?'],
        twilioConfigured: twilioMessagingConfigured(),
      },
      docs: 'docs/SUPPORT_SMS.md',
    },
  })
}
