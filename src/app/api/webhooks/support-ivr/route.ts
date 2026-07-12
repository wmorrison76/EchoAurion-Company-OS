import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { IVR_DTMF_TO_GATE, parseIntakeGate } from '@/lib/intake-gate'
import { processInboundQuestion } from '@/lib/help-desk-knights'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * Future Twilio / phone IVR webhook scaffold.
 * DTMF → gate mapping (1 TECH, 2 BILLING, 3 BUILD, 4 OTHER) → HelpTicket.
 * Compiles without Twilio credentials. Auth: SUPPORT_IVR_WEBHOOK_SECRET or
 * SUPPORT_INGEST_SECRET Bearer (optional until production).
 *
 * See docs/SUPPORT_IVR.md
 */

const schema = z.object({
  /** Digits pressed, e.g. "1" */
  Digits: z.string().optional(),
  digits: z.string().optional(),
  gate: z.string().optional(),
  From: z.string().optional(),
  CallSid: z.string().optional(),
  clientKey: z.string().optional(),
  transcript: z.string().optional(),
  /** Opaque install id — required to attribute ticket. */
  SpeechResult: z.string().optional(),
})

function ivrAuthorized(req: Request): boolean {
  const secret =
    process.env.SUPPORT_IVR_WEBHOOK_SECRET?.trim() ||
    process.env.SUPPORT_INGEST_SECRET?.trim()
  if (!secret) {
    // Scaffold mode: allow in development only so builds don't need Twilio.
    return process.env.NODE_ENV !== 'production'
  }
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (match && match[1] === secret) return true
  const twilioSig = req.headers.get('x-twilio-signature')
  // Full Twilio signature verify TODO when credentials exist.
  return Boolean(twilioSig && process.env.NODE_ENV !== 'production')
}

export async function POST(req: Request): Promise<Response> {
  if (!ivrAuthorized(req)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  try {
    const contentType = req.headers.get('content-type') ?? ''
    let raw: Record<string, unknown>
    if (contentType.includes('application/json')) {
      raw = (await req.json()) as Record<string, unknown>
    } else {
      const form = await req.formData()
      raw = Object.fromEntries(form.entries()) as Record<string, unknown>
    }

    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid IVR payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }

    const digits = String(parsed.data.Digits ?? parsed.data.digits ?? '').trim()
    const gate =
      parseIntakeGate(parsed.data.gate) ??
      (digits ? IVR_DTMF_TO_GATE[digits] : undefined) ??
      null

    if (!gate) {
      return Response.json(
        {
          success: false,
          error: 'Unknown DTMF — press 1 TECH, 2 BILLING, 3 BUILD, 4 OTHER',
          code: 'IVR_GATE_UNKNOWN',
        },
        { status: 400 }
      )
    }

    const clientKey =
      String(parsed.data.clientKey ?? '').trim() ||
      `ivr:${String(parsed.data.From ?? 'unknown').slice(-8)}`

    const question =
      String(parsed.data.transcript ?? parsed.data.SpeechResult ?? '').trim() ||
      `[Phone IVR] Caller selected ${gate} (DTMF ${digits || 'n/a'})`

    const created = await db.customerQuestion.create({
      data: {
        clientKey,
        question: question.slice(0, 4000),
        intakeGate: gate,
        context: {
          channel: 'phone_ivr',
          callSid: parsed.data.CallSid ?? null,
          fromHint: parsed.data.From ? 'redacted' : null,
          gate,
        } as Prisma.InputJsonValue,
        actor: 'computer_agent',
      },
    })

    const ticket = await db.helpTicket.create({
      data: {
        channel: 'VOICE',
        intakeChannel: 'PHONE_IVR',
        intakeGate: gate,
        status: 'OPEN',
        subject: question.slice(0, 120),
        clientKey,
        customerQuestionId: created.id,
        messages: {
          create: [{ role: 'CUSTOMER', body: question }],
        },
      },
    })

    await audit('computer_agent', 'support.ivr.intake', ticket.id, { gate, digits })

    void processInboundQuestion(created.id).catch((err) => {
      console.error('[support-ivr] processInboundQuestion failed', err)
    })

    // Twilio-compatible TwiML stub (XML) when Accept prefers xml.
    const accept = req.headers.get('accept') ?? ''
    if (accept.includes('xml') || contentType.includes('www-form-urlencoded')) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thanks. Your ${gate} request was received. Ticket ${ticket.id.slice(0, 8)}.</Say>
  <Hangup/>
</Response>`
      return new Response(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    return Response.json(
      {
        success: true,
        data: {
          ticketId: ticket.id,
          questionId: created.id,
          gate,
          intakeChannel: 'PHONE_IVR',
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
        error: error instanceof Error ? error.message : 'IVR ingest failed',
        code: 'IVR_FAILED',
      },
      { status: 500 }
    )
  }
}

/** GET — IVR tree documentation for operators (no secrets). */
export async function GET(): Promise<Response> {
  return Response.json({
    success: true,
    data: {
      tree: [
        { digit: '1', gate: 'TECH', label: '◆ Tech support' },
        { digit: '2', gate: 'BILLING', label: '● Billing' },
        { digit: '3', gate: 'BUILD', label: '■ Paid build / change' },
        { digit: '4', gate: 'OTHER', label: '○ Other' },
      ],
      endpoint: '/api/webhooks/support-ivr',
      docs: 'docs/SUPPORT_IVR.md',
      twilioRequired: false,
    },
  })
}
