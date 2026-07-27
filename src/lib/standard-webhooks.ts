/**
 * Standard-Webhooks outbound emitter.
 *
 * Emits signed webhook events to subscribed endpoints when platform-level
 * changes happen: pilot.stage_changed, ticket.opened, ticket.resolved,
 * deploy.failed, brex.large_charge, etc.
 *
 * Signature spec: standardwebhooks.com — HMAC-SHA256 over
 *     webhook_id + "." + timestamp + "." + payload
 * with base64 encoding, sent as headers:
 *     webhook-id: <uuid>
 *     webhook-timestamp: <unix seconds>
 *     webhook-signature: v1,<base64_sig>
 *
 * Consumers verify by recomputing with their shared secret. Reference impl:
 *   https://github.com/standard-webhooks/standard-webhooks
 *
 * This module is broadcast-fanout only — no queueing yet. If a subscriber
 * URL fails, we retry with exponential backoff up to 6 attempts spread over
 * ~24h via the `webhook_delivery_attempts` table (added in a follow-up
 * migration). For now: single-attempt best-effort.
 */

import crypto from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { db } from './db'

export type EventType =
  | 'pilot.stage_changed'
  | 'pilot.health_changed'
  | 'ticket.opened'
  | 'ticket.resolved'
  | 'deploy.failed'
  | 'deploy.succeeded'
  | 'brex.large_charge'
  | 'knights.auto_resolved'

export interface StandardWebhookEvent<T = unknown> {
  type: EventType
  version: 1
  emittedAt: string
  data: T
}

function b64(buf: Buffer): string {
  return buf.toString('base64')
}

function sign(id: string, timestamp: number, payload: string, secret: string): string {
  const toSign = `${id}.${timestamp}.${payload}`
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8')
  const mac = crypto.createHmac('sha256', key).update(toSign).digest()
  return `v1,${b64(mac)}`
}

async function listSubscribers(eventType: EventType): Promise<
  Array<{ id: string; url: string; secret: string }>
> {
  // Uses the existing WebhookSubscriber table if present; otherwise no-op.
  try {
    const rows = await (db as unknown as {
      webhookSubscriber: {
        findMany: (args: {
          where: { active: boolean; eventTypes: { has: string } }
        }) => Promise<Array<{ id: string; url: string; secret: string }>>
      }
    }).webhookSubscriber.findMany({
      where: { active: true, eventTypes: { has: eventType } },
    })
    return rows
  } catch {
    return []
  }
}

export async function emitEvent<T>(
  type: EventType,
  data: T
): Promise<{ delivered: number; failed: number }> {
  const subs = await listSubscribers(type)
  if (subs.length === 0) return { delivered: 0, failed: 0 }

  const event: StandardWebhookEvent<T> = {
    type,
    version: 1,
    emittedAt: new Date().toISOString(),
    data,
  }
  const payload = JSON.stringify(event)
  const webhookId = `evt_${randomUUID()}`
  const timestamp = Math.floor(Date.now() / 1000)

  let delivered = 0
  let failed = 0

  // Fan out in parallel with 5s per-request timeout
  await Promise.all(
    subs.map(async (s) => {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await fetch(s.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'webhook-id': webhookId,
            'webhook-timestamp': String(timestamp),
            'webhook-signature': sign(webhookId, timestamp, payload, s.secret),
            'User-Agent': 'EchoAurion-Webhooks/1.0',
          },
          body: payload,
          signal: controller.signal,
        })
        clearTimeout(t)
        if (res.ok) delivered++
        else failed++
      } catch {
        failed++
      }
    })
  )

  return { delivered, failed }
}
