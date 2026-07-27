import { auth } from '@/lib/auth'
import { sendPush, pushConfigured } from '@/lib/push'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

// Sends a test notification to all registered devices.
export async function POST(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  if (!pushConfigured()) {
    return Response.json(
      { success: false, error: 'Push not configured (set VAPID keys)', code: '503' },
      { status: 503 }
    )
  }
  await sendPush({
    title: 'EchoAurion',
    body: 'Test notification — your phone is connected.',
    url: '/dr-os',
    tag: 'test',
  })
  return Response.json({ success: true, data: { sent: true } } satisfies APIResponse<{ sent: boolean }>)
}
