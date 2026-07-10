import type { Prisma } from '@prisma/client'
import { EventEmitter } from 'events'
import { db } from '@/lib/db'

export type RelayEventType = 'answer_ready' | 'work_status' | 'directive' | 'ping'

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
