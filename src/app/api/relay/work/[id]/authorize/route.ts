import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { relayAuthorized } from '@/lib/relay-auth'
import { requireWorkAgreement } from '@/lib/work-agreement'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({ token: z.string().min(1) })

/**
 * SPEND GATE — billing contact token + WorkAgreement (paid-via-profile).
 * Authorize is blocked without a signed WorkAgreement. Token must still be
 * an active BillingContact for this clientKey. William's execute is the other key.
 * See docs/PAID_VIA_PROFILE.md.
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

    const agreementGate = await requireWorkAgreement(id)
    if (!agreementGate.ok) {
      return Response.json(
        { success: false, error: agreementGate.error, code: agreementGate.code },
        { status: agreementGate.status }
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
    await audit('computer_agent', 'work.request.authorize', id, {
      approver: contact.name,
      agreementId: agreementGate.agreement.id,
      signerRole: agreementGate.agreement.signerRole,
    })
    await raiseAlert({
      kind: 'question',
      severity: 'WARN',
      title: `Quote authorized: ${work.title}`,
      body: `${contact.name} approved $${work.quoteTotal ?? 0} (agreement signed by ${agreementGate.agreement.signerName}). Awaiting your execute.`,
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
