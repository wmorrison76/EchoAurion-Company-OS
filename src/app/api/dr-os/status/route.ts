import { auth } from '@/lib/auth'
import { getDrOsStatus } from '@/lib/status'

export const dynamic = 'force-dynamic'

// SSE status stream (CLAUDE.md §10.4). The client reconnects on each 60s poll
// rather than holding a persistent connection, so we push once and close.
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const push = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }
      try {
        const status = await getDrOsStatus()
        push({ type: 'status', ...status })
      } catch (error) {
        push({ type: 'error', error: error instanceof Error ? error.message : 'Status failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
