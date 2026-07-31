/**
 * Cross-instance relay SSE fan-out via Upstash Redis Streams (REST).
 * When UPSTASH_REDIS_REST_* is unset, relay-outbox falls back to in-process EventEmitter only.
 *
 * Flow: publishRelayEvent → XADD relay:fanout → each web replica polls XREAD → local bus.emit
 * Reconnect / missed live events: stream route still flushes undelivered RelayOutbox rows.
 */

import type { RelayEvent } from '@/lib/relay-outbox'

const RELAY_STREAM = 'relay:fanout'
const POLL_MS = 250
const MAX_STREAM_LEN = 10_000

function redisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  )
}

async function redisCommand(...args: string[]): Promise<unknown> {
  const base = process.env.UPSTASH_REDIS_REST_URL!.trim().replace(/\/$/, '')
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim()
  const res = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`Upstash Redis HTTP ${res.status}`)
  const json = (await res.json()) as { result?: unknown }
  return json.result
}

/** True when shared Redis is available for relay fan-out (and rate limits). */
export function relayPubsubConfigured(): boolean {
  return redisConfigured()
}

/** Push a live event to the shared stream (best-effort). */
export async function publishRelayFanout(event: RelayEvent): Promise<void> {
  if (!redisConfigured()) return
  try {
    await redisCommand(
      'XADD',
      RELAY_STREAM,
      'MAXLEN',
      '~',
      String(MAX_STREAM_LEN),
      '*',
      'data',
      JSON.stringify(event)
    )
  } catch {
    /* non-fatal — outbox + pull fallback remain */
  }
}

type StreamRow = [string, string[]]

function parseStreamRows(raw: unknown): StreamRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  const block = raw[0]
  if (!Array.isArray(block) || block.length < 2) return []
  const entries = block[1]
  if (!Array.isArray(entries)) return []
  return entries.filter(
    (e): e is StreamRow => Array.isArray(e) && typeof e[0] === 'string' && Array.isArray(e[1])
  )
}

function rowToEvent(row: StreamRow): RelayEvent | null {
  const fields = row[1]
  for (let i = 0; i < fields.length - 1; i += 2) {
    if (fields[i] === 'data' && typeof fields[i + 1] === 'string') {
      try {
        const parsed = JSON.parse(fields[i + 1]) as RelayEvent
        if (parsed?.id && parsed?.clientKey && parsed?.type) return parsed
      } catch {
        return null
      }
    }
  }
  return null
}

let pollerStarted = false
let lastStreamId = '0-0'

async function initStreamCursor(): Promise<void> {
  try {
    const raw = await redisCommand('XREVRANGE', RELAY_STREAM, '+', '-', 'COUNT', '1')
    if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0]) && typeof raw[0][0] === 'string') {
      lastStreamId = raw[0][0]
    }
  } catch {
    lastStreamId = '0-0'
  }
}

/**
 * Start polling the relay stream once per process; dispatches to local listeners.
 * Safe to call from every SSE subscribe — idempotent.
 */
export function ensureRelayFanoutPoller(listener: (event: RelayEvent) => void): void {
  if (!redisConfigured() || pollerStarted) return
  pollerStarted = true

  void initStreamCursor().then(() => {
    const tick = async () => {
      try {
        const raw = await redisCommand(
          'XREAD',
          'COUNT',
          '100',
          'STREAMS',
          RELAY_STREAM,
          lastStreamId
        )
        const rows = parseStreamRows(raw)
        for (const row of rows) {
          lastStreamId = row[0]
          const ev = rowToEvent(row)
          if (ev) listener(ev)
        }
      } catch {
        /* retry next tick */
      }
    }
    void tick()
    setInterval(() => void tick(), POLL_MS)
  })
}
