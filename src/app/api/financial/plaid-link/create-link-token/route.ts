import { auth } from '@/lib/auth'
import { createLinkToken, plaidConfigured } from '@/lib/plaid'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  if (!plaidConfigured()) {
    return Response.json({ success: false, error: 'Plaid not configured' }, { status: 503 })
  }
  try {
    const linkToken = await createLinkToken()
    const body: APIResponse<{ linkToken: string }> = { success: true, data: { linkToken } }
    return Response.json(body)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Link token failed' },
      { status: 500 }
    )
  }
}
