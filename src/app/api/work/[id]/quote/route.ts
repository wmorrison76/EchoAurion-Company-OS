import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { COMPLEXITY_TIERS, computeQuote } from '@/lib/pricing'
import { evaluateSpendCap } from '@/lib/spend-cap'
import { getAutonomyConfig } from '@/lib/autonomy'
import { checkConstitution } from '@/lib/constitution'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  tier: z.enum(COMPLEXITY_TIERS),
  humanHours: z.number().positive().max(500).optional(),
})

// William sets the complexity tier + hours; the quote is computed and FROZEN
// (snapshot stored) so the customer authorizes an exact, immutable price.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const { id } = await params
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid quote payload' }, { status: 400 })
    }
    const work = await db.workRequest.findUnique({ where: { id } })
    if (!work) return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    if (work.status === 'EXECUTED' || work.status === 'ROLLED_BACK') {
      return Response.json(
        { success: false, error: `Cannot re-quote a ${work.status} request` },
        { status: 409 }
      )
    }
    const quote = computeQuote(parsed.data.tier, parsed.data.humanHours)
    const autonomy = await getAutonomyConfig()
    if (['T3', 'T4', 'T5'].includes(quote.tier)) {
      const t3 = checkConstitution('quote_t3_plus', { autonomyDial: autonomy.dial, tier: quote.tier })
      // Autopilot cannot auto-approve T3+ — quoting by William is still allowed; flag in snapshot.
      void t3
    }

    const spend = await evaluateSpendCap(work.clientKey, quote.total)
    if (spend.blocked) {
      return Response.json(
        {
          success: false,
          error: spend.message,
          code: 'SPEND_CAP',
          data: spend,
        },
        { status: 409 }
      )
    }

    await db.workRequest.update({
      where: { id },
      data: {
        tier: quote.tier,
        humanHours: quote.humanHours,
        quoteTotal: quote.total,
        quoteSnapshot: {
          ...quote,
          spendCap: spend,
        } as unknown as Prisma.InputJsonValue,
        status: 'QUOTED',
        quotedAt: new Date(),
        // Re-quoting resets a prior customer authorization.
        approvedByCustomer: false,
        customerApprover: null,
      },
    })
    await audit('william_morrison', 'work.request.quote', id, {
      tier: quote.tier,
      total: quote.total,
      spendCap: spend,
    } as unknown as Prisma.InputJsonValue)

    const ticket = await db.helpTicket.findFirst({ where: { workRequestId: id } })
    if (ticket) {
      const { recordTimelineEvent } = await import('@/lib/help-timeline')
      await recordTimelineEvent({
        ticketId: ticket.id,
        kind: 'quoted',
        detail: `${quote.tier} · $${quote.total} · remaining cap $${spend.remainingUsd}`,
      }).catch(() => {})
    }

    return Response.json({
      success: true,
      data: { ...quote, spendCap: spend },
    } satisfies APIResponse<typeof quote & { spendCap: typeof spend }>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Quote failed' },
      { status: 500 }
    )
  }
}
