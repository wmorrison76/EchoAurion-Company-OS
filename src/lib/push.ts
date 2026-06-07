import type { PushSubscription as PushSub } from '@prisma/client'
import { db } from '@/lib/db'

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/** True when VAPID keys are configured — push send is dormant until then. */
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

/**
 * Best-effort web push to every registered device. No-op (logs only) when
 * VAPID keys are absent, so nothing breaks before the keys are set. Stale
 * subscriptions (410/404) are pruned automatically.
 */
export async function sendPush(payload: PushPayload): Promise<void> {
  if (!pushConfigured()) return
  let webpush: typeof import('web-push')
  try {
    webpush = await import('web-push')
  } catch {
    return // dependency not installed in this environment
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:admin@echoaurion.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const subs = await db.pushSubscription.findMany()
  await Promise.allSettled(
    subs.map(async (s: PushSub) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        )
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
        }
      }
    })
  )
}
