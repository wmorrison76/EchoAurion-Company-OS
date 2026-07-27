import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { COMPLEXITY_TIERS, computeQuote } from '@/lib/pricing'
import { canRequestBuild, buildRoleGateMessage, normalizePilotRole } from '@/lib/work-roles'
import { validateAgreementInput } from '@/lib/work-agreement'
import { toDetail } from '@/lib/help-desk'
import {
  LAB_ECHO_CHROME_CLIENT_KEY,
  LAB_ECHO_CHROME_LABEL,
  LAB_ECHO_CHROME_PROPERTY,
} from '@/lib/lab-echo-chrome'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'
import type { Quote } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

const schema = z.object({
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(8000),
  tier: z.enum(COMPLEXITY_TIERS).default('T2'),
  humanHours: z.number().positive().max(500).optional(),
  profileName: z.string().min(1).max(120),
  profileRole: z.string().min(1).max(40),
  profileEmail: z.string().email().optional().nullable(),
  agreed: z.boolean(),
  typedSignature: z.string().min(1).max(120),
})

/**
 * Lab: Build request + paid-via-profile agreement.
 * Role-gated (ADMIN/DIRECTOR/EXEC). Creates FEATURE ticket, WorkRequest,
 * quote freeze, and WorkAgreement so it appears in Help Desk / Inbox.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid build payload' }, { status: 400 })
    }
    const body = parsed.data

    if (!canRequestBuild(body.profileRole)) {
      return Response.json(
        {
          success: false,
          error: buildRoleGateMessage(body.profileRole),
          code: 'ROLE_GATE',
        },
        { status: 403 }
      )
    }

    const agreementCheck = validateAgreementInput({
      role: body.profileRole,
      signerName: body.profileName,
      typedSignature: body.typedSignature,
      agreed: body.agreed,
    })
    if (!agreementCheck.ok) {
      return Response.json({ success: false, error: agreementCheck.error }, { status: 400 })
    }

    const role = normalizePilotRole(body.profileRole)!
    const quote = computeQuote(body.tier, body.humanHours)

    const client = await db.supportClient.upsert({
      where: { clientKey: LAB_ECHO_CHROME_CLIENT_KEY },
      create: {
        clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
        label: LAB_ECHO_CHROME_LABEL,
        property: LAB_ECHO_CHROME_PROPERTY,
      },
      update: { label: LAB_ECHO_CHROME_LABEL, property: LAB_ECHO_CHROME_PROPERTY },
    })

    const work = await db.workRequest.create({
      data: {
        clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
        clientId: client.id,
        kind: 'ADDON',
        title: body.title.trim(),
        detail: body.detail.trim(),
        requesterName: body.profileName.trim(),
        requesterRole: role,
        tier: quote.tier,
        humanHours: quote.humanHours,
        quoteTotal: quote.total,
        quoteSnapshot: quote as unknown as Prisma.InputJsonValue,
        status: 'QUOTED',
        quotedAt: new Date(),
        actor: 'william_morrison',
        context: {
          source: 'lab.echo_chrome',
          simulated: true,
          profileEmail: body.profileEmail ?? null,
        },
      },
    })

    const agreement = await db.workAgreement.create({
      data: {
        workRequestId: work.id,
        signerName: body.profileName.trim(),
        signerEmail: body.profileEmail?.trim() || null,
        signerRole: role,
        typedSignature: body.typedSignature.trim(),
        quoteTotal: quote.total,
        source: 'lab',
      },
    })

    const ticket = await db.helpTicket.create({
      data: {
        channel: 'FEATURE',
        status: 'OPEN',
        priority: 'NORMAL',
        subject: body.title.trim(),
        clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
        clientId: client.id,
        requesterName: body.profileName.trim(),
        workRequestId: work.id,
        messages: {
          create: [
            {
              role: 'SYSTEM',
              body: `Lab Echo chrome · Build request · ${quote.tier} quote ${quote.total} USD · agreement signed by ${body.profileName} (${role}).`,
            },
            {
              role: 'CUSTOMER',
              body: `${body.detail.trim()}\n\n— ${body.profileName.trim()}, ${role}`,
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

    await audit('william_morrison', 'lab.echo_chrome.build.create', work.id, {
      ticketId: ticket.id,
      agreementId: agreement.id,
      tier: quote.tier,
      total: quote.total,
      signerRole: role,
    })
    await audit('william_morrison', 'work.agreement.create', agreement.id, {
      workRequestId: work.id,
      source: 'lab',
    })

    return Response.json({
      success: true,
      data: {
        ticket: toDetail(ticket),
        workRequestId: work.id,
        agreementId: agreement.id,
        quote,
        clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
        helpDeskUrl: `/help-desk?ticket=${ticket.id}`,
        status: 'QUOTED' as const,
        note: 'Agreement on file — authorize still needs BillingContact token (or lab authorize helper).',
      },
    } satisfies APIResponse<{
      ticket: HelpTicketDetail
      workRequestId: string
      agreementId: string
      quote: Quote
      clientKey: string
      helpDeskUrl: string
      status: 'QUOTED'
      note: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Lab build request failed',
      },
      { status: 500 }
    )
  }
}
