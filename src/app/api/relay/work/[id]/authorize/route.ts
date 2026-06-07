import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { relayAuthorized } from '@/lib/relay-auth'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({ token: z.string().min(1) })

/**
 * SPEND GATE — the property's designated billing contact authorizes a quote.
 * Requires a valid, active billing-contact token scoped to THIS request's
 * clientKey. A staff member without a billing token cannot approve spend.
 * This is one of the two keys; William's execute approval is the other.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const a = relayAuthorized(req)
  if (!a.ok) return Response.json({ success: false, error: a.error }, { status: a.status })
  try {
    const { id } = await params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Token required' }, { status: 400 })
    }
    const work = await db.workRequest.findUnique({ where: { id } })
    if (!work) return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    if (work.status !== 'QUOTED') {
      return Response.json(
        { success: false, error: `Cannot authorize a request in status ${work.status}` },
        { status: 409 }
      )
    }
    // Gate: token must belong to an active billing contact for THIS property.
    const contact = await db.billingContact.findUnique({ where: { token: parsed.data.token } })
    if (!contact || !contact.active || contact.clientKey !== work.clientKey) {
      return Response.json(
        { success: false, error: 'Not authorized to approve spend for this property', code: '403' },
        { status: 403 }
      )
    }
    await db.workRequest.update({
      where: { id },
      data: {
        approvedByCustomer: true,
        customerApprover: contact.name,
        status: 'AUTHORIZED',
        authorizedAt: new Date(),
      },
    })
    await audit('computer_agent', 'work.request.authorize', id, { approver: contact.name })
    await raiseAlert({
      kind: 'question',
      severity: 'WARN',
      title: `Quote authorized: ${work.title}`,
      body: `${contact.name} approved $${work.quoteTotal ?? 0}. Awaiting your execute.`,
      entityRef: id,
      url: '/support',
    })
    return Response.json({ success: true, data: { id } } satisfies APIResponse<{ id: string }>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Authorize failed' },
      { status: 500 }
    )
  }
}
