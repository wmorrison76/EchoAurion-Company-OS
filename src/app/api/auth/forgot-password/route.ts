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

/**
 * POST /api/auth/forgot-password
 * Always returns a generic success message when the request is well-formed
 * (does not reveal whether the email matched ADMIN_EMAIL), except when email
 * delivery is not configured — then returns a clear setup error without
 * leaking match status.
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

  const email = parsed.data.email.trim().toLowerCase()
  const ip = clientIp(req)
  const rateKey = `forgot:${ip}:${email}`

  if (!checkRateLimit(rateKey)) {
    // Same generic message — do not reveal rate-limit vs success to attackers.
    return Response.json({
      success: true,
      data: {
        message:
          'If that email is registered, a reset link has been sent. Check your inbox.',
      },
    } satisfies APIResponse<{ message: string }>)
  }

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

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const genericSuccess = {
    success: true as const,
    data: {
      message:
        'If that email is registered, a reset link has been sent. Check your inbox.',
    },
  } satisfies APIResponse<{ message: string }>

  // Only create/send when email matches admin — still return generic success.
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
        // Still generic to the client — do not leak match; log for ops.
        return Response.json(genericSuccess)
      }

      await audit('computer_agent', 'auth.password_reset.request').catch(() => {})
    } catch (err) {
      console.error('[forgot-password] failed:', err)
    }
  }

  return Response.json(genericSuccess)
}
