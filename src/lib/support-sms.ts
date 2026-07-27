/**
 * SMS status lite — Twilio Messaging when keys present; otherwise stub/no-op.
 * Never stores guest phone numbers on HelpTicket. Status texts are opt-in via
 * explicit `toE164` on the send call (operator / property-provided).
 *
 * See docs/SUPPORT_SMS.md
 */

import { audit } from '@/lib/audit'

export type SmsSendMode = 'sent' | 'stubbed' | 'skipped' | 'error'

export interface SmsSendResult {
  ok: boolean
  mode: SmsSendMode
  sid: string | null
  error?: string
}

export function twilioMessagingConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_PHONE_NUMBER?.trim()
  )
}

/**
 * Send a short status SMS. Feature-flagged: no Twilio keys → stub success (logged).
 * `toE164` must be E.164 (+1…). Never log the full number in audit payloads.
 */
export async function sendSupportStatusSms(opts: {
  toE164: string
  body: string
  ticketId?: string
  clientKey?: string
  actor?: 'william_morrison' | 'computer_agent'
}): Promise<SmsSendResult> {
  const actor = opts.actor ?? 'computer_agent'
  const to = opts.toE164.trim()
  const body = opts.body.trim().slice(0, 320)

  if (!to || !/^\+[1-9]\d{6,14}$/.test(to)) {
    return { ok: false, mode: 'error', sid: null, error: 'Invalid toE164' }
  }
  if (!body) {
    return { ok: false, mode: 'error', sid: null, error: 'Empty body' }
  }

  if (!twilioMessagingConfigured()) {
    await audit(actor, 'support.sms.status_stub', opts.ticketId, {
      mode: 'stubbed',
      toLast4: to.slice(-4),
      clientKey: opts.clientKey ?? null,
      bodyLen: body.length,
    }).catch(() => {})
    return {
      ok: true,
      mode: 'stubbed',
      sid: null,
      error: 'TWILIO_* unset — SMS stubbed (no send)',
    }
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!.trim()
  const token = process.env.TWILIO_AUTH_TOKEN!.trim()
  const from = process.env.TWILIO_PHONE_NUMBER!.trim()
  const auth = Buffer.from(`${sid}:${token}`).toString('base64')

  try {
    const form = new URLSearchParams({
      To: to,
      From: from,
      Body: body,
    })
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        mode: 'error',
        sid: null,
        error: `Twilio ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    const json = (await res.json()) as { sid?: string }
    await audit(actor, 'support.sms.status_sent', opts.ticketId, {
      mode: 'sent',
      toLast4: to.slice(-4),
      messageSid: json.sid ?? null,
      clientKey: opts.clientKey ?? null,
    }).catch(() => {})
    return { ok: true, mode: 'sent', sid: json.sid ?? null }
  } catch (err) {
    return {
      ok: false,
      mode: 'error',
      sid: null,
      error: err instanceof Error ? err.message : 'SMS send failed',
    }
  }
}

/** Short status copy for notify-when-fixed / resolve (no PII). */
export function statusSmsBody(opts: {
  ticketId: string
  status: string
  subject?: string
}): string {
  const short = opts.ticketId.slice(0, 8)
  const subj = (opts.subject ?? 'request').slice(0, 40)
  return `EchoAurion support: #${short} "${subj}" is now ${opts.status}. Reply STOP to opt out.`
}
