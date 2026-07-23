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
export const maxDuration = 30

/**
 * Twilio / phone IVR webhook — DTMF → IntakeGate → HelpTicket.
 *
 * Conversation phases (docs/SUPPORT_IVR.md):
 *  A. First hit           → DTMF Gather menu (1 tech / 2 billing / 3 build / 4 other)
 *  B. Digits received     → TECH/OTHER: speech Gather ("tell us what's happening");
 *                           BILLING/BUILD: ticket now, human follow-up (never auto-answered)
 *  C. ?stage=speech       → transcript → CustomerQuestion + VOICE ticket → Knights
 *                           fire-and-forget → hold loop (Pause + Redirect)
 *  D. ?stage=answer       → if an approved ADMIN reply landed, SPEAK it (turn-based
 *                           talk-to-talk); else re-hold up to 3 attempts, then promise
 *                           follow-up. Only approved ADMIN sends are ever spoken —
 *                           knight drafts behind the approval gate stay silent.
 *
 * Feature flags:
 * - SUPPORT_IVR_VOICE_ANSWER=off disables phase D (intake-only, default on)
 * - No TWILIO_AUTH_TOKEN → Bearer secret or dev bypass
 * - With TWILIO_AUTH_TOKEN → validate X-Twilio-Signature when present
 *
 * See docs/SUPPORT_IVR.md · docs/SUPPORT_VOICE.md · docs/SUPPORT_90_DAY_PLAN.md
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
  // Twilio signs the exact URL it requested, including query params — rebuild
  // it from the configured public base plus this request's search string.
  const base = process.env.SUPPORT_IVR_PUBLIC_URL?.trim()
  const search = new URL(req.url).search
  const url = base ? base.split('?')[0] + search : req.url
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

function voiceAnswerEnabled(): boolean {
  const v = (process.env.SUPPORT_IVR_VOICE_ANSWER ?? 'on').toLowerCase()
  return !['off', 'false', '0'].includes(v)
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Trim an approved reply into something speakable: strip markdown, cap length. */
function speakable(body: string): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, ' — see your ticket for the technical details — ')
    .replace(/[*_#>`~[\]()]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' link in your ticket ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > 750 ? `${plain.slice(0, 750)}… The full answer is in your ticket.` : plain
}

function twiml(inner: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${inner}\n</Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml' } }
  )
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

/** Speech Gather for TECH/OTHER after the caller picks a gate. */
function speechPrompt(gate: string): Response {
  return twiml(
    [
      `  <Gather input="speech" speechTimeout="auto" language="en-US" action="/api/webhooks/support-ivr?stage=speech&amp;gate=${gate}" method="POST">`,
      `    <Say>Tell us what's happening, in your own words, after the tone. When you're done, just pause.</Say>`,
      `  </Gather>`,
      `  <Say>We didn't catch that. A ticket has been opened and a specialist will follow up. Goodbye.</Say>`,
      `  <Redirect method="POST">/api/webhooks/support-ivr?stage=speech&amp;gate=${gate}</Redirect>`,
    ].join('\n')
  )
}

/** Hold music-free wait loop while Knights work. */
function holdAndRetry(ticketId: string, attempt: number): Response {
  return twiml(
    [
      attempt === 1
        ? `  <Say>Thanks. Our team is looking at that right now. One moment.</Say>`
        : `  <Say>Still working on it. Thanks for your patience.</Say>`,
      `  <Pause length="8"/>`,
      `  <Redirect method="POST">/api/webhooks/support-ivr?stage=answer&amp;ticket=${ticketId}&amp;attempt=${attempt}</Redirect>`,
    ].join('\n')
  )
}

function followUpGoodbye(ticketId: string): Response {
  return twiml(
    [
      `  <Say>Our specialists are on it. Your ticket is ${xmlEscape(ticketId.slice(0, 8))}, and you'll get the answer by your usual support channel shortly. Goodbye.</Say>`,
      `  <Hangup/>`,
    ].join('\n')
  )
}

async function createTicketFromCall(input: {
  gate: 'TECH' | 'BILLING' | 'BUILD' | 'OTHER'
  question: string
  clientKey: string
  callSid: string | null
  hasFrom: boolean
  digits: string
}): Promise<{ ticketId: string; questionId: string }> {
  const now = new Date()
  const dues = slaDueFieldsForCreate(now, input.gate)

  const created = await db.customerQuestion.create({
    data: {
      clientKey: input.clientKey,
      question: input.question.slice(0, 4000),
      intakeGate: input.gate,
      context: {
        channel: 'phone_ivr',
        callSid: input.callSid,
        fromHint: input.hasFrom ? 'redacted' : null,
        gate: input.gate,
      } as Prisma.InputJsonValue,
      actor: 'computer_agent',
    },
  })

  const ticket = await db.helpTicket.create({
    data: {
      channel: 'VOICE',
      intakeChannel: 'PHONE_IVR',
      intakeGate: input.gate,
      status: 'OPEN',
      subject: input.question.slice(0, 120),
      clientKey: input.clientKey,
      customerQuestionId: created.id,
      firstResponseDueAt: dues.firstResponseDueAt,
      resolveDueAt: dues.resolveDueAt,
      messages: {
        create: [{ role: 'CUSTOMER', body: input.question }],
      },
    },
  })

  await audit('computer_agent', 'support.ivr.intake', ticket.id, {
    gate: input.gate,
    digits: input.digits,
  })

  void processInboundQuestion(created.id).catch((err) => {
    console.error('[support-ivr] processInboundQuestion failed', err)
  })

  return { ticketId: ticket.id, questionId: created.id }
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

    const url = new URL(req.url)
    const stage = url.searchParams.get('stage')
    const digits = String(parsed.data.Digits ?? parsed.data.digits ?? '').trim()
    const accept = req.headers.get('accept') ?? ''
    const wantsTwiml =
      accept.includes('xml') || contentType.includes('www-form-urlencoded')

    const clientKey =
      String(parsed.data.clientKey ?? '').trim() ||
      `ivr:${String(parsed.data.From ?? 'unknown').slice(-8)}`
    const callSid = parsed.data.CallSid ? String(parsed.data.CallSid) : null

    // ── Stage D: caller is holding — speak the approved answer if it landed ──
    if (stage === 'answer' && wantsTwiml) {
      const ticketId = url.searchParams.get('ticket') ?? ''
      const attempt = Number(url.searchParams.get('attempt') ?? 1)
      if (!ticketId) return followUpGoodbye('unknown')

      const reply = await db.helpMessage.findFirst({
        where: { ticketId, role: 'ADMIN' },
        orderBy: { createdAt: 'desc' },
        select: { body: true },
      })
      if (reply?.body) {
        await audit('computer_agent', 'support.ivr.voice_answer', ticketId, {
          attempt,
          spoken: true,
        }).catch(() => {})
        return twiml(
          [
            `  <Say>${xmlEscape(speakable(reply.body))}</Say>`,
            `  <Say>This answer is also saved on your ticket ${xmlEscape(ticketId.slice(0, 8))}. Goodbye.</Say>`,
            `  <Hangup/>`,
          ].join('\n')
        )
      }
      if (attempt < 3) return holdAndRetry(ticketId, attempt + 1)
      await audit('computer_agent', 'support.ivr.voice_answer', ticketId, {
        attempt,
        spoken: false,
      }).catch(() => {})
      return followUpGoodbye(ticketId)
    }

    // ── Stage C: speech transcript arrives → real ticket + hold for answer ──
    if (stage === 'speech' && wantsTwiml) {
      const gate =
        parseIntakeGate(url.searchParams.get('gate')) ??
        parseIntakeGate(parsed.data.gate) ??
        'TECH'
      const transcript = String(
        parsed.data.SpeechResult ?? parsed.data.transcript ?? ''
      ).trim()
      const question =
        transcript || `[Phone IVR] Caller selected ${gate} (no speech captured)`

      const { ticketId } = await createTicketFromCall({
        gate,
        question,
        clientKey,
        callSid,
        hasFrom: Boolean(parsed.data.From),
        digits,
      })

      // Talk-to-talk only for the free gates; and only when transcription worked.
      if (voiceAnswerEnabled() && transcript && (gate === 'TECH' || gate === 'OTHER')) {
        return holdAndRetry(ticketId, 1)
      }
      return twiml(
        [
          `  <Say>Thanks. Your ${gate.toLowerCase()} request was received. Ticket ${xmlEscape(ticketId.slice(0, 8))}. A specialist will follow up. Goodbye.</Say>`,
          `  <Hangup/>`,
        ].join('\n')
      )
    }

    // ── Stage A: no digits yet → DTMF Gather menu (Twilio first hit) ─────────
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

    // ── Stage B: gate chosen. TECH/OTHER get the speech prompt (phase 1);
    // BILLING/BUILD create the ticket now and stay human-routed. ─────────────
    if (wantsTwiml && (gate === 'TECH' || gate === 'OTHER') && !parsed.data.SpeechResult) {
      return speechPrompt(gate)
    }

    const question =
      String(parsed.data.transcript ?? parsed.data.SpeechResult ?? '').trim() ||
      `[Phone IVR] Caller selected ${gate} (DTMF ${digits || 'n/a'})`

    const { ticketId, questionId } = await createTicketFromCall({
      gate,
      question,
      clientKey,
      callSid,
      hasFrom: Boolean(parsed.data.From),
      digits,
    })

    if (wantsTwiml) {
      return twiml(
        [
          `  <Say>Thanks. Your ${gate.toLowerCase()} request was received. Ticket ${xmlEscape(ticketId.slice(0, 8))}. ${gate === 'BILLING' || gate === 'BUILD' ? 'A specialist will follow up personally.' : 'A specialist will follow up.'} Goodbye.</Say>`,
          `  <Hangup/>`,
        ].join('\n')
      )
    }

    return Response.json(
      {
        success: true,
        data: {
          ticketId,
          questionId,
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
      conversation: {
        phase1: 'TECH/OTHER → speech Gather (say the problem, transcript seeds the ticket)',
        phase2:
          'Knights draft + auto-approve → approved ADMIN reply is SPOKEN back on the call (hold loop, 3 × 8s). Only approved sends are voiced — drafts stay behind the gate.',
        flags: 'SUPPORT_IVR_VOICE_ANSWER=off → intake-only',
        billingBuild: 'BILLING/BUILD never auto-answer — human follow-up promised.',
      },
      endpoint: '/api/webhooks/support-ivr',
      docs: 'docs/SUPPORT_IVR.md',
      twilioConfigured,
      twilioRequired: false,
      shape: twilioConfigured ? '✓' : '◇',
      label: twilioConfigured ? 'Twilio credentials present' : 'Feature-flagged scaffold',
    },
  })
}
