import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// Plaid webhook receiver (CLAUDE.md §22.1). This route is excluded from auth
// middleware. Plaid posts transaction/item lifecycle events here; we record
// them to the audit trail and acknowledge. A signed-verification step and
// targeted re-sync can be layered on once the webhook secret is provisioned.
// TODO(claude): verify Plaid webhook JWT (Plaid-Verification header) before trusting payloads.
export async function POST(req: Request): Promise<Response> {
  try {
    const payload = (await req.json()) as {
      webhook_type?: string
      webhook_code?: string
      item_id?: string
    }
    await audit('computer_agent', 'financial.plaid.webhook', payload.item_id, {
      type: payload.webhook_type,
      code: payload.webhook_code,
    }).catch(() => {})
  } catch {
    // Always acknowledge to avoid Plaid retries storms on a malformed body.
  }
  return Response.json({ received: true })
}
