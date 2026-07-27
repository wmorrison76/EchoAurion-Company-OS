import { z } from 'zod'
import { audit } from '@/lib/audit'
import {
  checkRateLimit,
  clientIp,
  generateResetToken,
} from '@/lib/admin-password'
import { db } from '@/lib/db'
import { buildPasswordResetEmail, isEmailConfigured, sendEmail } from '@/lib/email'
import type { APIResponse } from '@/types'

const bodySchema = z.object({
  email: z.string().email(),
})

const GENERIC_SUCCESS = {
  success: true as const,
  data: {
    message:
      'If that email is registered, a reset link has been sent. Check your inbox.',
  },
} satisfies APIResponse<{ message: string }>

/**
 * POST /api/auth/forgot-password
 *
 * Anti-enumeration: wrong / unknown email → generic success.
 * Distinguishes ops failures so the UI can guide setup:
 *   - EMAIL_NOT_CONFIGURED (503) — RESEND/SMTP + EMAIL_FROM missing
 *   - EMAIL_SEND_FAILED (502) — provider rejected or network error
 */
export async function POST(req: Request) {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return Response.json(
      { success: false, error: 'Invalid request body', code: '400' } satisfies APIResponse<never>,
      { status: 400 }
    )
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { success: false, error: 'Invalid email', code: '400' } satisfies APIResponse<never>,
      { status: 400 }
    )
  }

  // Config check before rate-limit so retries never mask "not configured" as success.
  if (!isEmailConfigured()) {
    console.error(
      '[forgot-password] Email is not configured (set RESEND_API_KEY + EMAIL_FROM, or SMTP_* + EMAIL_FROM)'
    )
    return Response.json(
      {
        success: false,
        error: 'Email is not configured',
        code: 'EMAIL_NOT_CONFIGURED',
      } satisfies APIResponse<never>,
      { status: 503 }
    )
  }

  const email = parsed.data.email.trim().toLowerCase()
  const ip = clientIp(req)
  const rateKey = `forgot:${ip}:${email}`

  if (!checkRateLimit(rateKey)) {
    // Same generic message — do not reveal rate-limit vs success to attackers.
    return Response.json(GENERIC_SUCCESS)
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()

  // Only create/send when email matches admin — still return generic success on miss.
  if (adminEmail && email === adminEmail) {
    try {
      const { raw, hash, expiresAt } = generateResetToken()
      await db.passwordResetToken.create({
        data: { tokenHash: hash, expiresAt },
      })

      const baseUrl = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(
        /\/$/,
        ''
      )
      const resetUrl = `${baseUrl}/login/reset?token=${encodeURIComponent(raw)}`
      const mail = buildPasswordResetEmail(resetUrl)
      const sent = await sendEmail({ to: adminEmail, ...mail })

      if (!sent.ok) {
        if (sent.reason === 'not_configured') {
          return Response.json(
            {
              success: false,
              error: 'Email is not configured',
              code: 'EMAIL_NOT_CONFIGURED',
            } satisfies APIResponse<never>,
            { status: 503 }
          )
        }

        console.error('[forgot-password] send failed:', sent.detail)
        await audit('computer_agent', 'auth.password_reset.send_failed', undefined, {
          detail: sent.detail ?? 'send_failed',
        }).catch(() => {})

        return Response.json(
          {
            success: false,
            error:
              'Unable to send reset email. Check Resend (API key, EMAIL_FROM, and that ADMIN_EMAIL can receive mail on the free tier).',
            code: 'EMAIL_SEND_FAILED',
          } satisfies APIResponse<never>,
          { status: 502 }
        )
      }

      await audit('computer_agent', 'auth.password_reset.request').catch(() => {})
    } catch (err) {
      console.error('[forgot-password] failed:', err)
      await audit('computer_agent', 'auth.password_reset.send_failed', undefined, {
        detail: err instanceof Error ? err.message : 'unknown',
      }).catch(() => {})

      return Response.json(
        {
          success: false,
          error: 'Unable to send reset email. Try again or check server logs.',
          code: 'EMAIL_SEND_FAILED',
        } satisfies APIResponse<never>,
        { status: 502 }
      )
    }
  }

  return Response.json(GENERIC_SUCCESS)
}
