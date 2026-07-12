import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { IVR_DTMF_TO_GATE, parseIntakeGate } from '@/lib/intake-gate'
import { slaDueFieldsForCreate } from '@/lib/help-desk'
import { processInboundQuestion } from '@/lib/help-desk-knights'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * Twilio / phone IVR webhook — DTMF → IntakeGate → HelpTicket.
 * Feature-flagged:
 * - No TWILIO_AUTH_TOKEN → Bearer secret or dev bypass
 * - With TWILIO_AUTH_TOKEN → validate X-Twilio-Signature when present
 *
 * See docs/SUPPORT_IVR.md · docs/SUPPORT_90_DAY_PLAN.md
 */

const schema = z.object({
  Digits: z.string().optional(),
  digits: z.string().optional(),
  gate: z.string().optional(),
  From: z.string().optional(),
  CallSid: z.string().optional(),
  clientKey: z.string().optional(),
  transcript: z.string().optional(),
  SpeechResult: z.string().optional(),
})

function twilioSignatureValid(req: Request, rawBody: string): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN?.trim()
  const sig = req.headers.get('x-twilio-signature')
  if (!token || !sig) return false
  const url = process.env.SUPPORT_IVR_PUBLIC_URL?.trim() || req.url
  const expected = createHmac('sha1', token).update(url + rawBody).digest('base64')
  try {
    const a = Buffer.from(expected)
    const b = Buffer.from(sig)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function ivrAuthorized(req: Request, rawBody: string): boolean {
  const twilioToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  if (twilioToken && req.headers.get('x-twilio-signature')) {
    return twilioSignatureValid(req, rawBody)
  }

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
  // Dev convenience when Twilio posts without our Bearer.
  return Boolean(req.headers.get('x-twilio-signature') && process.env.NODE_ENV !== 'production')
}

function twimlMenu(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/api/webhooks/support-ivr" method="POST" timeout="8">
    <Say>Echo Aurion support. Press 1 for tech. Press 2 for billing. Press 3 for a paid build. Press 4 for other.</Say>
  </Gather>
  <Say>We did not get a selection. Goodbye.</Say>
  <Hangup/>
</Response>`
}

export async function POST(req: Request): Promise<Response> {
  const contentType = req.headers.get('content-type') ?? ''
  let rawBody = ''
  let raw: Record<string, unknown>

  if (contentType.includes('application/json')) {
    rawBody = await req.text()
    raw = JSON.parse(rawBody || '{}') as Record<string, unknown>
  } else {
    rawBody = await req.text()
    const params = new URLSearchParams(rawBody)
    raw = Object.fromEntries(params.entries()) as Record<string, unknown>
  }

  if (!ivrAuthorized(req, rawBody)) {
    return Response.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  try {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid IVR payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }

    const digits = String(parsed.data.Digits ?? parsed.data.digits ?? '').trim()
    const accept = req.headers.get('accept') ?? ''
    const wantsTwiml =
      accept.includes('xml') || contentType.includes('www-form-urlencoded')

    // No digits yet → return Gather menu (Twilio first hit).
    if (!digits && !parsed.data.gate && wantsTwiml) {
      return new Response(twimlMenu(), {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    const gate =
      parseIntakeGate(parsed.data.gate) ??
      (digits ? IVR_DTMF_TO_GATE[digits] : undefined) ??
      null

    if (!gate) {
      if (wantsTwiml) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Unknown selection. Press 1 tech, 2 billing, 3 build, 4 other.</Say>
  <Redirect>/api/webhooks/support-ivr</Redirect>
</Response>`,
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        )
      }
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

    const now = new Date()
    const dues = slaDueFieldsForCreate(now, gate)

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
        firstResponseDueAt: dues.firstResponseDueAt,
        resolveDueAt: dues.resolveDueAt,
        messages: {
          create: [{ role: 'CUSTOMER', body: question }],
        },
      },
    })

    await audit('computer_agent', 'support.ivr.intake', ticket.id, { gate, digits })

    void processInboundQuestion(created.id).catch((err) => {
      console.error('[support-ivr] processInboundQuestion failed', err)
    })

    if (wantsTwiml) {
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

/** GET — IVR tree + TwiML menu for operators / Twilio voice URL. */
export async function GET(req: Request): Promise<Response> {
  const accept = req.headers.get('accept') ?? ''
  if (accept.includes('xml') || new URL(req.url).searchParams.get('twiml') === '1') {
    return new Response(twimlMenu(), {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const twilioConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim()
  )

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
      twilioConfigured,
      twilioRequired: false,
      shape: twilioConfigured ? '✓' : '◇',
      label: twilioConfigured ? 'Twilio credentials present' : 'Feature-flagged scaffold',
    },
  })
}
