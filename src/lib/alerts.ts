import { db } from '@/lib/db'
import { sendPush } from '@/lib/push'
import type { AlertSeverity } from '@/types/support'

interface RaiseAlertInput {
  kind: 'client_health' | 'question' | 'report' | 'system'
  severity: AlertSeverity
  title: string
  body?: string
  entityRef?: string
  /** Deep link opened when the phone notification is tapped. */
  url?: string
}

/**
 * Records an alert and fires a best-effort phone push. Used by the relay and
 * diagnostics ingest so problems reach William's pocket instead of waiting in
 * a dashboard he has to remember to open.
 */
export async function raiseAlert(input: RaiseAlertInput): Promise<void> {
  await db.alert.create({
    data: {
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      body: input.body ?? null,
      entityRef: input.entityRef ?? null,
    },
  })
  await sendPush({
    title: input.title,
    body: input.body ?? '',
    url: input.url ?? '/support',
    tag: input.kind,
  }).catch(() => {})
}
