import { loadBillingPortal } from '@/lib/billing-portal'
import type { APIResponse } from '@/types'
import type { BillingPortalView } from '@/lib/billing-portal'

export const dynamic = 'force-dynamic'

function extractToken(req: Request): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  const url = new URL(req.url)
  const q = url.searchParams.get('token')?.trim()
  return q || null
}

/**
 * GET /api/portal/billing — token-gated quote history for billing contacts.
 * No Dr. OS session. Same generic 401 for bad/missing token.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const token = extractToken(req)
    if (!token) {
      return Response.json(
        { success: false, error: 'Invalid credentials', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    const result = await loadBillingPortal(token)
    if (!result.ok) {
      return Response.json(
        { success: false, error: result.error, code: result.code },
        { status: result.status }
      )
    }
    return Response.json({
      success: true,
      data: result.data,
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<BillingPortalView>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Portal load failed',
      },
      { status: 500 }
    )
  }
}
