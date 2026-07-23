import { z } from 'zod'
import { audit } from '@/lib/audit'
import { verifyPlaidWebhook } from '@/lib/plaid-webhook-verify'

export const dynamic = 'force-dynamic'

// Plaid webhook receiver (CLAUDE.md §22.1). This route is excluded from auth
// middleware, so it must self-guard: the Plaid-Verification JWT is checked
// (signature + freshness + body hash) whenever Plaid credentials are
// configured. Unverified posts are rejected before anything is recorded.
// When Plaid is entirely unconfigured the route keeps its historical
// audit-only acknowledge so sandbox wiring can proceed.
const webhookSchema = z.object({
  webhook_type: z.string().max(64).optional(),
  webhook_code: z.string().max(64).optional(),
  item_id: z.string().max(128).optional(),
})

export async function POST(req: Request): Promise<Response> {
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return Response.json({ received: true })
  }

  const verdict = await verifyPlaidWebhook(req, rawBody)
  if (verdict.ok === false) {
    await audit('computer_agent', 'financial.plaid.webhook.rejected', undefined, {
      reason: verdict.reason,
    }).catch(() => {})
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const payload = webhookSchema.parse(JSON.parse(rawBody))
    await audit('computer_agent', 'financial.plaid.webhook', payload.item_id, {
      type: payload.webhook_type,
      code: payload.webhook_code,
      verified: verdict.ok === true,
    }).catch(() => {})
  } catch {
    // Always acknowledge a malformed body to avoid Plaid retry storms.
  }
  return Response.json({ received: true })
}
