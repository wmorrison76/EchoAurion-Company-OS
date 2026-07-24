import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import crypto from 'node:crypto'
import type { APIResponse } from '@/types'

/**
 * Standard-Webhooks subscriber management.
 *
 * GET   /api/webhooks/subscribers          — list subscribers (owner-scoped)
 * POST  /api/webhooks/subscribers          — create a subscriber, returns secret ONCE
 *
 * Secret is only shown on creation. Subsequent GETs show a truncated preview.
 * Rotate by DELETE + re-POST.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const KNOWN_EVENT_TYPES = [
  'pilot.stage_changed',
  'pilot.health_changed',
  'ticket.opened',
  'ticket.resolved',
  'deploy.failed',
  'deploy.succeeded',
  'brex.large_charge',
  'knights.auto_resolved',
]

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  const rows = await db.webhookSubscriber.findMany({
    where: { ownerEmail: session.user.email },
    orderBy: { createdAt: 'desc' },
  })
  const data = rows.map((r) => ({
    id: r.id,
    url: r.url,
    description: r.description,
    active: r.active,
    eventTypes: r.eventTypes,
    secretPreview: r.secret.slice(0, 10) + '…',
    createdAt: r.createdAt.toISOString(),
  }))
  return Response.json({ success: true, data } satisfies APIResponse<typeof data>)
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  let body: { url?: string; description?: string; eventTypes?: string[] }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  if (!body.url || !/^https:\/\//.test(body.url)) {
    return Response.json({ success: false, error: 'url must be https' }, { status: 400 })
  }
  const eventTypes = (body.eventTypes ?? []).filter((t) => KNOWN_EVENT_TYPES.includes(t))
  if (eventTypes.length === 0) {
    return Response.json(
      {
        success: false,
        error: `eventTypes required; supported: ${KNOWN_EVENT_TYPES.join(', ')}`,
      },
      { status: 400 }
    )
  }

  const secret = 'whsec_' + crypto.randomBytes(32).toString('base64')
  const row = await db.webhookSubscriber.create({
    data: {
      ownerEmail: session.user.email,
      url: body.url,
      description: body.description ?? null,
      eventTypes,
      secret,
    },
  })

  await audit('william_morrison', 'webhooks.subscriber.create', row.id, {
    url: body.url,
    ownerEmail: session.user.email,
    eventTypes,
  })

  return Response.json({
    success: true,
    data: {
      id: row.id,
      url: row.url,
      eventTypes: row.eventTypes,
      secret, // shown ONCE
      description: row.description,
      warning:
        'Store this secret — it will not be shown again. Use to verify webhook-signature header per standardwebhooks.com.',
    },
  })
}
