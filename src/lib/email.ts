/**
 * Transactional email for Company OS (password reset).
 * Prefers Resend (RESEND_API_KEY + EMAIL_FROM); falls back to SMTP_* via nodemailer.
 */

export type SendEmailInput = {
  to: string
  subject: string
  text: string
  html: string
}

export type SendEmailResult =
  | { ok: true; provider: 'resend' | 'smtp' }
  | { ok: false; reason: 'not_configured' | 'send_failed'; detail?: string }

export function isEmailConfigured(): boolean {
  const from = process.env.EMAIL_FROM?.trim()
  if (!from) return false
  if (process.env.RESEND_API_KEY?.trim()) return true
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  )
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.EMAIL_FROM?.trim()
  if (!from) {
    console.error('[email] EMAIL_FROM is not set — cannot send mail')
    return { ok: false, reason: 'not_configured' }
  }

  const resendKey = process.env.RESEND_API_KEY?.trim()
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`[email] Resend error ${res.status}: ${body}`)
        return { ok: false, reason: 'send_failed', detail: `Resend ${res.status}` }
      }
      return { ok: true, provider: 'resend' }
    } catch (err) {
      console.error('[email] Resend request failed:', err)
      return {
        ok: false,
        reason: 'send_failed',
        detail: err instanceof Error ? err.message : 'unknown',
      }
    }
  }

  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  if (host && user && pass) {
    try {
      const nodemailer = await import('nodemailer')
      const port = Number(process.env.SMTP_PORT ?? '587')
      const secure = process.env.SMTP_SECURE === 'true' || port === 465
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      })
      await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      })
      return { ok: true, provider: 'smtp' }
    } catch (err) {
      console.error('[email] SMTP send failed:', err)
      return {
        ok: false,
        reason: 'send_failed',
        detail: err instanceof Error ? err.message : 'unknown',
      }
    }
  }

  console.error(
    '[email] Neither RESEND_API_KEY nor SMTP_HOST/USER/PASS configured — cannot send mail'
  )
  return { ok: false, reason: 'not_configured' }
}

export function buildPasswordResetEmail(resetUrl: string): {
  subject: string
  text: string
  html: string
} {
  const subject = 'Reset your EchoAurion Company OS password'
  const text = [
    'You requested a password reset for EchoAurion Company OS.',
    '',
    `Open this link within 1 hour to set a new password:`,
    resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
    '',
    '— Aurion Holdings, Inc.',
  ].join('\n')

  const html = `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#0a0a0f;color:#ffffff;font-family:Inter,system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:440px;background:#12121a;border:1px solid #2a2a3f;border-radius:12px;padding:28px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#D4AF37;">EchoAurion Company OS</p>
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">Password reset</h1>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#a0a0b8;">
                You requested a password reset. This link expires in 1 hour and can be used once.
              </p>
              <p style="margin:0 0 24px;">
                <a href="${resetUrl}" style="display:inline-block;background:#D4AF37;color:#0a0a0f;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:12px;">
                  Set new password
                </a>
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#5a5a78;">
                If the button does not work, paste this URL into your browser:<br/>
                <span style="color:#a0a0b8;word-break:break-all;">${resetUrl}</span>
              </p>
              <p style="margin:20px 0 0;font-size:12px;color:#5a5a78;">
                If you did not request this, ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim()

  return { subject, text, html }
}
