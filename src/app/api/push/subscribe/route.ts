import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { pushConfigured } from '@/lib/push'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

// Returns the VAPID public key the client needs to subscribe (or configured:false).
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  return Response.json({
    success: true,
    data: { configured: pushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY ?? null },
  } satisfies APIResponse<{ configured: boolean; publicKey: string | null }>)
}

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid subscription' }, { status: 400 })
    }
    const { endpoint, keys } = parsed.data
    await db.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { p256dh: keys.p256dh, auth: keys.auth },
    })
    await audit('william_morrison', 'push.subscription.create')
    return Response.json({ success: true, data: { ok: true } } satisfies APIResponse<{ ok: boolean }>, {
      status: 201,
    })
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Subscribe failed' },
      { status: 500 }
    )
  }
}
