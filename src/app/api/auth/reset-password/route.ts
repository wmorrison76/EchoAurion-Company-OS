import { z } from 'zod'
import { audit } from '@/lib/audit'
import {
  checkRateLimit,
  clientIp,
  hashResetToken,
  MIN_PASSWORD_LENGTH,
  setAdminPasswordHash,
} from '@/lib/admin-password'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

const bodySchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
})

/**
 * POST /api/auth/reset-password
 * Consumes a single-use token and writes the new bcrypt hash to AdminAuth
 * so login works without updating Render env vars.
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
      {
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        code: '400',
      } satisfies APIResponse<never>,
      { status: 400 }
    )
  }

  const { token, password } = parsed.data
  const ip = clientIp(req)
  if (!checkRateLimit(`reset:${ip}`, 60 * 1000)) {
    return Response.json(
      { success: false, error: 'Too many attempts. Try again shortly.', code: '429' } satisfies APIResponse<never>,
      { status: 429 }
    )
  }

  const tokenHash = hashResetToken(token)
  const now = new Date()

  try {
    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash },
    })

    if (!record || record.usedAt || record.expiresAt < now) {
      return Response.json(
        {
          success: false,
          error: 'This reset link is invalid or has expired',
          code: 'INVALID_TOKEN',
        } satisfies APIResponse<never>,
        { status: 400 }
      )
    }

    await setAdminPasswordHash(password)

    await db.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    })

    // Invalidate any other outstanding tokens.
    await db.passwordResetToken.updateMany({
      where: { usedAt: null, id: { not: record.id } },
      data: { usedAt: now },
    })

    await audit('william_morrison', 'auth.password_reset.complete', record.id).catch(
      () => {}
    )

    return Response.json({
      success: true,
      data: { message: 'Password updated. You can sign in with your new password.' },
    } satisfies APIResponse<{ message: string }>)
  } catch (err) {
    console.error('[reset-password] failed:', err)
    return Response.json(
      { success: false, error: 'Unable to reset password', code: '500' } satisfies APIResponse<never>,
      { status: 500 }
    )
  }
}
