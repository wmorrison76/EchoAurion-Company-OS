import { randomBytes } from 'crypto'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { requireWorkAgreement } from '@/lib/work-agreement'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  workRequestId: z.string().min(1),
})

/**
 * Lab helper: simulate billing authorize after WorkAgreement is on file.
 * Ensures agreement gate is exercised, then marks AUTHORIZED.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'workRequestId required' }, { status: 400 })
    }
    const { workRequestId } = parsed.data

    const work = await db.workRequest.findUnique({ where: { id: workRequestId } })
    if (!work) {
      return Response.json({ success: false, error: 'Work request not found' }, { status: 404 })
    }
    if (work.status !== 'QUOTED') {
      return Response.json(
        { success: false, error: `Need QUOTED status (have ${work.status})` },
        { status: 409 }
      )
    }

    const agreementGate = await requireWorkAgreement(workRequestId)
    if (!agreementGate.ok) {
      return Response.json(
        { success: false, error: agreementGate.error, code: agreementGate.code },
        { status: agreementGate.status }
      )
    }

    let contact = await db.billingContact.findFirst({
      where: { clientKey: work.clientKey, active: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!contact) {
      contact = await db.billingContact.create({
        data: {
          clientKey: work.clientKey,
          name: agreementGate.agreement.signerName,
          token: randomBytes(24).toString('hex'),
          active: true,
        },
      })
    }

    await db.workRequest.update({
      where: { id: workRequestId },
      data: {
        approvedByCustomer: true,
        customerApprover: agreementGate.agreement.signerName,
        status: 'AUTHORIZED',
        authorizedAt: new Date(),
      },
    })

    await audit('william_morrison', 'lab.echo_chrome.authorize', workRequestId, {
      agreementId: agreementGate.agreement.id,
      approver: agreementGate.agreement.signerName,
    })

    return Response.json({
      success: true,
      data: {
        workRequestId,
        status: 'AUTHORIZED' as const,
        customerApprover: agreementGate.agreement.signerName,
        agreementId: agreementGate.agreement.id,
      },
    } satisfies APIResponse<{
      workRequestId: string
      status: 'AUTHORIZED'
      customerApprover: string
      agreementId: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Lab authorize failed',
      },
      { status: 500 }
    )
  }
}
