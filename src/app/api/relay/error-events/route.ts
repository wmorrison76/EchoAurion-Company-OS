import { z } from 'zod'
import { relayGuard, requireClientKey } from '@/lib/relay-auth'
import { ingestErrorEvent } from '@/lib/error-events'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import { verifyRequestHandshake } from '@/lib/request-handshake'
import { assertRegisteredOrSystemClient } from '@/lib/tenant-isolation'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  clientKey: z.string().min(1).max(200),
  fingerprint: z.string().min(8).max(128),
  message: z.string().min(1).max(500),
  stack: z.string().max(8000).optional().nullable(),
  errorClass: z.string().max(120).optional().nullable(),
  moduleHint: z.string().max(120).optional().nullable(),
  scopeHint: z.enum(['USER', 'ACCOUNT', 'COHORT', 'GLOBAL']).optional().nullable(),
  categoryHint: z
    .enum(['UI', 'API', 'AUTH', 'DATA', 'INTEGRATION', 'INFRA', 'UNKNOWN'])
    .optional()
    .nullable(),
  productLine: z.string().max(64).optional().nullable(),
  sessionHint: z.string().max(64).optional().nullable(),
  appVersion: z.string().max(50).optional().nullable(),
  platform: z.string().max(50).optional().nullable(),
  browser: z.string().max(80).optional().nullable(),
  os: z.string().max(80).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
  // canaryClientKeys intentionally omitted — operator-set only
})

/**
 * POST /api/relay/error-events
 * Pilot → Company OS auto Help Desk ticket (SYSTEM channel).
 * Triple handshake: Bearer secret + clientKey + timestamp/nonce (see SECURITY_RELAY.md).
 * No guest PII — message/stack only, redacted server-side.
 * Response never includes full ticket messages (tenant isolation).
 */
export async function POST(req: Request): Promise<Response> {
  const a = relayGuard(req, 'diagnostics')
  if (!a.ok) {
    return Response.json(
      { success: false, error: a.error, code: a.code },
      { status: a.status }
    )
  }

  try {
    const rawBody = await req.text()
    let json: unknown
    try {
      json = JSON.parse(rawBody)
    } catch {
      return Response.json(
        { success: false, error: 'Invalid JSON', code: 'SCHEMA' },
        { status: 400 }
      )
    }

    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid error_event payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }
    const key = requireClientKey(parsed.data.clientKey)
    if (!key.ok) {
      return Response.json(
        { success: false, error: key.error, code: key.code },
        { status: key.status }
      )
    }

    const hs = await verifyRequestHandshake({
      req,
      route: 'relay.error-events',
      clientKey: key.clientKey,
      rawBody,
    })
    if (!hs.ok) {
      return Response.json(
        { success: false, error: hs.error, code: hs.code, label: '✕ Handshake failed' },
        { status: hs.status }
      )
    }

    await assertRegisteredOrSystemClient(key.clientKey)

    const throttle = allowIngestThrottle({
      scope: 'error',
      clientKey: key.clientKey,
    })
    if (!throttle.ok) return throttleResponse(throttle)

    const result = await ingestErrorEvent({
      ...parsed.data,
      clientKey: key.clientKey,
      canaryClientKeys: null,
    })

    const status = result.created ? 201 : 202

    return Response.json(
      {
        success: true,
        data: {
          ticketId: result.ticket.id,
          created: result.created,
          promoted: result.promoted,
          scope: result.ticket.errorScope,
          occurrenceCount: result.ticket.occurrenceCount,
          label: result.created
            ? '✓ Ticket opened'
            : `○ Deduped · ×${result.ticket.occurrenceCount}`,
        },
      } satisfies APIResponse<{
        ticketId: string
        created: boolean
        promoted: boolean
        scope: typeof result.ticket.errorScope
        occurrenceCount: number
        label: string
      }>,
      { status }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'error_event ingest failed',
        code: 'INGEST_FAILED',
        label: '✕ Ingest failed',
      },
      { status: 500 }
    )
  }
}
