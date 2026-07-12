import { z } from 'zod'
import { relayGuard, requireClientKey } from '@/lib/relay-auth'
import { ingestErrorEvent } from '@/lib/error-events'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

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
  canaryClientKeys: z.array(z.string().max(200)).max(50).optional().nullable(),
})

/**
 * POST /api/relay/error-events
 * Pilot → Company OS auto Help Desk ticket (SYSTEM channel).
 * Auth: SUPPORT_INGEST_SECRET bearer (same as heartbeat/diagnostics).
 * No guest PII — message/stack only, redacted server-side.
 * Rate-limited per clientKey + global budget (docs/SCALE_AND_THROTTLE.md).
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
    const parsed = schema.safeParse(await req.json())
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

    const throttle = allowIngestThrottle({
      scope: 'error',
      clientKey: key.clientKey,
    })
    if (!throttle.ok) return throttleResponse(throttle)

    const result = await ingestErrorEvent({
      ...parsed.data,
      clientKey: key.clientKey,
    })

    // 202 when deduped under load — pilot should treat as accepted (count bumped).
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
          ticket: result.ticket,
          label: result.created
            ? '✓ Ticket opened'
            : `○ Deduped · ×${result.ticket.occurrenceCount}`,
        },
      } satisfies APIResponse<{
        ticketId: string
        created: boolean
        promoted: boolean
        scope: HelpTicketDetail['errorScope']
        occurrenceCount: number
        ticket: HelpTicketDetail
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
