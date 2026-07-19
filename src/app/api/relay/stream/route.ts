import { relayAuthorized, requireClientKey } from '@/lib/relay-auth'
import {
  listUndelivered,
  markDelivered,
  subscribeRelay,
  type RelayEvent,
} from '@/lib/relay-outbox'
import { touchStreamConnected } from '@/lib/relay-heartbeat'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PING_MS = 25_000
const MAX_MS = 25 * 60 * 1000 // Render/proxy friendly upper bound

/**
 * GET /api/relay/stream?clientKey=… — SSE push to pilot.
 * Auth: Bearer SUPPORT_INGEST_SECRET or signed ?token= (EventSource-safe).
 * Events: answer_ready | work_status | directive | show_message | open_panel | navigate | maintenance_notice | ping
 * Flushes undelivered RelayOutbox rows on connect; marks delivered when sent.
 */
export async function GET(req: Request): Promise<Response> {
  const a = relayAuthorized(req, { allowQueryToken: true })
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }

  const url = new URL(req.url)
  const keyCheck = requireClientKey(
    url.searchParams.get('clientKey') ?? a.clientKeyFromToken
  )
  if (!keyCheck.ok) {
    return Response.json(
      { success: false, error: keyCheck.error, code: keyCheck.code },
      { status: keyCheck.status }
    )
  }
  const clientKey = keyCheck.clientKey

  // If auth came from a signed token, it must match the requested clientKey.
  if (a.clientKeyFromToken && a.clientKeyFromToken !== clientKey) {
    return Response.json(
      {
        success: false,
        error: 'Token clientKey mismatch',
        code: 'TOKEN_CLIENT_MISMATCH',
      },
      { status: 403 }
    )
  }

  const encoder = new TextEncoder()
  let closed = false
  let unsub: (() => void) | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RelayEvent) => {
        if (closed) return
        const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
        controller.enqueue(encoder.encode(frame))
      }

      const safeClose = () => {
        if (closed) return
        closed = true
        if (pingTimer) clearInterval(pingTimer)
        if (maxTimer) clearTimeout(maxTimer)
        if (unsub) unsub()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      try {
        await touchStreamConnected(clientKey)

        const pending = await listUndelivered(clientKey)
        // Mark delivered BEFORE send so a client reload mid-flight cannot
        // re-flush soft_reload and loop. Prefer lose-one-event over reload loops.
        await markDelivered(pending.map((p) => p.id))
        for (const ev of pending) {
          send(ev)
        }

        unsub = subscribeRelay(clientKey, (ev) => {
          void (async () => {
            await markDelivered([ev.id])
            send(ev)
            void touchStreamConnected(clientKey)
          })()
        })

        pingTimer = setInterval(() => {
          if (closed) return
          const ping: RelayEvent = {
            id: `ping-${Date.now()}`,
            clientKey,
            type: 'ping',
            payload: { serverTime: new Date().toISOString() },
            createdAt: new Date().toISOString(),
          }
          send(ping)
        }, PING_MS)

        maxTimer = setTimeout(safeClose, MAX_MS)

        req.signal.addEventListener('abort', safeClose)
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Stream failed'
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`)
        )
        safeClose()
      }
    },
    cancel() {
      closed = true
      if (pingTimer) clearInterval(pingTimer)
      if (maxTimer) clearTimeout(maxTimer)
      if (unsub) unsub()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
