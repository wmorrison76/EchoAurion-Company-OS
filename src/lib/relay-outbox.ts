import type { Prisma } from '@prisma/client'
import { EventEmitter } from 'events'
import { db } from '@/lib/db'

export type RelayEventType =
  | 'answer_ready'
  | 'work_status'
  | 'directive'
  | 'show_message'
  | 'open_panel'
  | 'navigate'
  | 'maintenance_notice'
  | 'feature_available'
  | 'ping'

export interface RelayEvent {
  id: string
  clientKey: string
  type: RelayEventType
  payload: Record<string, unknown>
  createdAt: string
}

/** In-memory fan-out so live SSE connections get events without polling. */
const bus = new EventEmitter()
bus.setMaxListeners(200)

const CHANNEL = (clientKey: string) => `relay:${clientKey}`

export function subscribeRelay(
  clientKey: string,
  listener: (event: RelayEvent) => void
): () => void {
  const ch = CHANNEL(clientKey)
  bus.on(ch, listener)
  return () => {
    bus.off(ch, listener)
  }
}

function emitLive(event: RelayEvent): void {
  bus.emit(CHANNEL(event.clientKey), event)
}

/**
 * Persist an outbox row and notify any live SSE subscribers.
 * Survives process restarts; stream flushes undelivered on connect.
 */
export async function publishRelayEvent(
  clientKey: string,
  type: RelayEventType,
  payload: Record<string, unknown>
): Promise<RelayEvent> {
  const row = await db.relayOutbox.create({
    data: {
      clientKey,
      type,
      payload: payload as Prisma.InputJsonValue,
    },
  })
  const event: RelayEvent = {
    id: row.id,
    clientKey,
    type: type,
    payload,
    createdAt: row.createdAt.toISOString(),
  }
  emitLive(event)
  return event
}

export async function listUndelivered(clientKey: string, limit = 50): Promise<RelayEvent[]> {
  const rows = await db.relayOutbox.findMany({
    where: { clientKey, deliveredAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  return rows.map((r) => ({
    id: r.id,
    clientKey: r.clientKey,
    type: r.type as RelayEventType,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function markDelivered(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.relayOutbox.updateMany({
    where: { id: { in: ids }, deliveredAt: null },
    data: { deliveredAt: new Date() },
  })
}

/** Convenience publishers used by approve / execute paths. */
export async function publishAnswerReady(input: {
  clientKey: string
  questionId: string
  question: string
  answer: string
  directive?: unknown
  standbyApproved?: boolean
}): Promise<void> {
  await publishRelayEvent(input.clientKey, 'answer_ready', {
    questionId: input.questionId,
    question: input.question,
    answer: input.answer,
    directive: input.directive ?? null,
    standbyApproved: input.standbyApproved ?? false,
  })
  if (input.directive != null) {
    await publishRelayEvent(input.clientKey, 'directive', {
      questionId: input.questionId,
      directive: input.directive,
    })
  }
}

export async function publishWorkStatus(input: {
  clientKey: string
  workId: string
  title: string
  status: string
  plan?: string | null
  rollbackRef?: string | null
}): Promise<void> {
  await publishRelayEvent(input.clientKey, 'work_status', {
    workId: input.workId,
    title: input.title,
    status: input.status,
    plan: input.plan ?? null,
    rollbackRef: input.rollbackRef ?? null,
  })
}

/** Push a toast / in-app message to the pilot. */
export async function publishShowMessage(input: {
  clientKey: string
  title: string
  body: string
  severity?: 'info' | 'success' | 'warning' | 'error'
  ticketId?: string
}): Promise<void> {
  const payload = {
    type: 'show_message' as const,
    title: input.title,
    body: input.body,
    severity: input.severity ?? 'info',
    ticketId: input.ticketId ?? null,
  }
  await publishRelayEvent(input.clientKey, 'show_message', payload)
  await publishRelayEvent(input.clientKey, 'directive', payload)
}

/** Ask the pilot UI to open a known panel (Echo-like or Company OS stub). */
export async function publishOpenPanel(input: {
  clientKey: string
  panelId: string
  params?: Record<string, unknown>
  ticketId?: string
}): Promise<void> {
  const payload = {
    type: 'open_panel' as const,
    panelId: input.panelId,
    params: input.params ?? null,
    ticketId: input.ticketId ?? null,
  }
  await publishRelayEvent(input.clientKey, 'open_panel', payload)
  await publishRelayEvent(input.clientKey, 'directive', payload)
}

/** Ask the pilot to navigate to a path. */
export async function publishNavigate(input: {
  clientKey: string
  path: string
  ticketId?: string
}): Promise<void> {
  const payload = {
    type: 'navigate' as const,
    path: input.path,
    ticketId: input.ticketId ?? null,
  }
  await publishRelayEvent(input.clientKey, 'navigate', payload)
  await publishRelayEvent(input.clientKey, 'directive', payload)
}

/** Recent outbox rows for a client (delivery status on Help Desk tickets). */
export async function listRecentOutbox(
  clientKey: string,
  limit = 20
): Promise<
  Array<{
    id: string
    type: string
    payload: Record<string, unknown>
    createdAt: string
    deliveredAt: string | null
    status: 'pending' | 'delivered'
  }>
> {
  const rows = await db.relayOutbox.findMany({
    where: { clientKey },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
    status: r.deliveredAt ? ('delivered' as const) : ('pending' as const),
  }))
}
