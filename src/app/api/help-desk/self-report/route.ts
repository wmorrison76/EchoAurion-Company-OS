import { auth } from '@/lib/auth'
import { z } from 'zod'
import { ingestErrorEvent } from '@/lib/error-events'
import { allowIngestThrottle, throttleResponse } from '@/lib/rate-limit'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

const schema = z.object({
  fingerprint: z.string().min(8).max(128),
  message: z.string().min(1).max(500),
  stack: z.string().max(8000).optional().nullable(),
  errorClass: z.string().max(120).optional().nullable(),
  moduleHint: z.string().max(120).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
})

/**
 * POST /api/help-desk/self-report
 * Company OS dogfood — authenticated UI crashes → same error_event path
 * with productLine `company-os`.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  const throttle = allowIngestThrottle({ scope: 'self_report' })
  if (!throttle.ok) return throttleResponse(throttle)

  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid self-report payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }

    const result = await ingestErrorEvent({
      ...parsed.data,
      clientKey: 'company-os-internal',
      productLine: 'company-os',
      source: parsed.data.source ?? 'CompanyOsErrorBoundary',
      scopeHint: 'ACCOUNT',
    })

    return Response.json(
      {
        success: true,
        data: {
          ticketId: result.ticket.id,
          created: result.created,
          scope: result.ticket.errorScope,
          label: result.created ? '✓ Self-report ticket' : '○ Deduped self-report',
        },
      } satisfies APIResponse<{
        ticketId: string
        created: boolean
        scope: HelpTicketDetail['errorScope']
        label: string
      }>,
      { status: result.created ? 201 : 202 }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'self-report failed',
        label: '✕ Self-report failed',
      },
      { status: 500 }
    )
  }
}
