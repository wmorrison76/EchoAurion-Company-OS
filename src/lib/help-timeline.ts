/**
 * Customer-visible Help Desk timeline events.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import {
  TIMELINE_KINDS,
  TIMELINE_LABEL,
  type TimelineKind,
} from '@/lib/help-timeline-types'

export {
  TIMELINE_KINDS,
  TIMELINE_LABEL,
  type TimelineKind,
} from '@/lib/help-timeline-types'

export async function recordTimelineEvent(input: {
  ticketId: string
  kind: TimelineKind
  label?: string
  detail?: string
  actor?: string
  visibleToCustomer?: boolean
}): Promise<{ id: string; kind: TimelineKind; label: string; createdAt: string }> {
  const label = input.label ?? TIMELINE_LABEL[input.kind]
  const row = await db.helpTimelineEvent.create({
    data: {
      ticketId: input.ticketId,
      kind: input.kind,
      label,
      detail: input.detail ?? null,
      actor: input.actor ?? 'william_morrison',
      visibleToCustomer: input.visibleToCustomer ?? true,
    },
  })
  await audit('william_morrison', 'help.timeline.event', input.ticketId, {
    kind: input.kind,
    label,
  }).catch(() => {})
  return {
    id: row.id,
    kind: input.kind,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listTimelineEvents(ticketId: string) {
  const rows = await db.helpTimelineEvent.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as TimelineKind,
    label: r.label,
    detail: r.detail,
    actor: r.actor,
    visibleToCustomer: r.visibleToCustomer,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Ensure a "received" event exists when a ticket is first opened. */
export async function ensureReceivedEvent(ticketId: string, subject: string): Promise<void> {
  const existing = await db.helpTimelineEvent.findFirst({
    where: { ticketId, kind: 'received' },
  })
  if (existing) return
  await recordTimelineEvent({
    ticketId,
    kind: 'received',
    detail: subject.slice(0, 200),
  })
}
