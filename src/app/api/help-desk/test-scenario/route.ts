import { randomBytes } from 'crypto'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

const TEST_CLIENT_KEY = 'test-miccosukee-kitchen'
const TEST_LABEL = 'Test Property — Miccosukee Kitchen'
const TEST_PROPERTY = 'Miccosukee Resort & Gaming'
const TEST_SUBJECT = "When we click Print BEO, add a 'Send to kitchen' button"
const TEST_DETAIL =
  'On the Print BEO screen, add a "Send to kitchen" button that routes the BEO to the kitchen printer queue. Requester wants this for banquet service.'
const TEST_REQUESTER_NAME = 'Giovanni (test)'
const TEST_REQUESTER_ROLE = 'GM'
const TEST_BILLING_NAME = 'Test Billing Contact (Miccosukee)'
const TEST_ROLLBACK_REF = 'test-rollback-001'

export interface TestScenarioSeed {
  ticket: HelpTicketDetail
  workRequestId: string
  clientKey: string
  clientId: string
  billingContactId: string
  /** Full token returned only for this admin test helper — simulate authorize without product relay. */
  billingToken: string
  checklist: string[]
  rollbackRef: string
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('seed') }),
  z.object({
    action: z.literal('authorize'),
    workRequestId: z.string().min(1),
  }),
])

/**
 * Guided E2E test seed + billing-authorize helper for Help Desk.
 * Auth required (admin session). Does not touch the product repo.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const raw = await req.json().catch(() => ({}))
    const parsed = actionSchema.safeParse(
      raw && typeof raw === 'object' && 'action' in (raw as object)
        ? raw
        : { action: 'seed' }
    )
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid test-scenario payload' }, { status: 400 })
    }

    if (parsed.data.action === 'authorize') {
      return authorizeSimulated(parsed.data.workRequestId)
    }

    return seedScenario()
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Test scenario failed',
      },
      { status: 500 }
    )
  }
}

async function seedScenario(): Promise<Response> {
  const client = await db.supportClient.upsert({
    where: { clientKey: TEST_CLIENT_KEY },
    create: {
      clientKey: TEST_CLIENT_KEY,
      label: TEST_LABEL,
      property: TEST_PROPERTY,
    },
    update: {
      label: TEST_LABEL,
      property: TEST_PROPERTY,
    },
  })

  let billing = await db.billingContact.findFirst({
    where: { clientKey: TEST_CLIENT_KEY, active: true },
    orderBy: { createdAt: 'desc' },
  })
  let billingToken: string
  if (billing) {
    billingToken = billing.token
  } else {
    billingToken = randomBytes(24).toString('hex')
    billing = await db.billingContact.create({
      data: {
        clientKey: TEST_CLIENT_KEY,
        name: TEST_BILLING_NAME,
        token: billingToken,
        active: true,
      },
    })
    await audit('william_morrison', 'work.billing_contact.create', billing.id, {
      clientKey: TEST_CLIENT_KEY,
      from: 'help_desk.test_scenario',
    })
  }

  const work = await db.workRequest.create({
    data: {
      clientKey: TEST_CLIENT_KEY,
      clientId: client.id,
      kind: 'ADDON',
      title: TEST_SUBJECT,
      detail: TEST_DETAIL,
      requesterName: TEST_REQUESTER_NAME,
      requesterRole: TEST_REQUESTER_ROLE,
      status: 'RECEIVED',
      actor: 'william_morrison',
      context: {
        source: 'help_desk.test_scenario',
        simulated: true,
      },
    },
  })
  await audit('william_morrison', 'work.request.create', work.id, {
    from: 'help_desk.test_scenario',
    title: TEST_SUBJECT,
  })

  const ticket = await db.helpTicket.create({
    data: {
      channel: 'FEATURE',
      status: 'OPEN',
      priority: 'NORMAL',
      subject: TEST_SUBJECT,
      clientKey: TEST_CLIENT_KEY,
      clientId: client.id,
      requesterName: TEST_REQUESTER_NAME,
      workRequestId: work.id,
      messages: {
        create: [
          {
            role: 'SYSTEM',
            body: 'Test scenario seeded · Simulate customer change request (admin intake). Product relay not required.',
          },
          {
            role: 'CUSTOMER',
            body: `${TEST_DETAIL}\n\n— ${TEST_REQUESTER_NAME}, ${TEST_REQUESTER_ROLE}`,
          },
        ],
      },
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      voiceNotes: { orderBy: { createdAt: 'asc' } },
      _count: { select: { messages: true } },
    },
  })

  await audit('william_morrison', 'help_desk.test_scenario.seed', ticket.id, {
    workRequestId: work.id,
    clientKey: TEST_CLIENT_KEY,
    clientId: client.id,
  })

  const data: TestScenarioSeed = {
    ticket: toDetail(ticket),
    workRequestId: work.id,
    clientKey: TEST_CLIENT_KEY,
    clientId: client.id,
    billingContactId: billing.id,
    billingToken,
    rollbackRef: TEST_ROLLBACK_REF,
    checklist: [
      '1 Ask Knights',
      '2 Review draft',
      '3 Approve free OR Send quote (pick T2)',
      '4 If quoted, simulate billing authorize',
      '5 Execute with rollback ref test-rollback-001',
    ],
  }

  return Response.json({
    success: true,
    data,
  } satisfies APIResponse<TestScenarioSeed>)
}

async function authorizeSimulated(workRequestId: string): Promise<Response> {
  const work = await db.workRequest.findUnique({ where: { id: workRequestId } })
  if (!work) {
    return Response.json({ success: false, error: 'Work request not found' }, { status: 404 })
  }
  if (work.status !== 'QUOTED') {
    return Response.json(
      {
        success: false,
        error: `Cannot simulate authorize — work status is ${work.status} (need QUOTED)`,
      },
      { status: 409 }
    )
  }

  let contact = await db.billingContact.findFirst({
    where: { clientKey: work.clientKey, active: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!contact) {
    const token = randomBytes(24).toString('hex')
    contact = await db.billingContact.create({
      data: {
        clientKey: work.clientKey,
        name: TEST_BILLING_NAME,
        token,
        active: true,
      },
    })
    await audit('william_morrison', 'work.billing_contact.create', contact.id, {
      clientKey: work.clientKey,
      from: 'help_desk.test_scenario.authorize',
    })
  }

  // Paid-via-profile: authorize requires WorkAgreement (create lab stub if missing).
  let agreement = await db.workAgreement.findUnique({ where: { workRequestId } })
  if (!agreement) {
    agreement = await db.workAgreement.create({
      data: {
        workRequestId,
        signerName: contact.name,
        signerEmail: null,
        signerRole: 'EXEC',
        typedSignature: contact.name,
        quoteTotal: work.quoteTotal,
        source: 'lab',
      },
    })
    await audit('william_morrison', 'work.agreement.create', agreement.id, {
      workRequestId,
      source: 'help_desk.test_scenario.authorize',
    })
  }

  await db.workRequest.update({
    where: { id: workRequestId },
    data: {
      approvedByCustomer: true,
      customerApprover: contact.name,
      status: 'AUTHORIZED',
      authorizedAt: new Date(),
    },
  })

  await audit('william_morrison', 'help_desk.test_scenario.authorize', workRequestId, {
    approver: contact.name,
    agreementId: agreement.id,
    simulated: true,
  })

  return Response.json({
    success: true,
    data: {
      workRequestId,
      status: 'AUTHORIZED' as const,
      customerApprover: contact.name,
    },
  } satisfies APIResponse<{
    workRequestId: string
    status: 'AUTHORIZED'
    customerApprover: string
  }>)
}
