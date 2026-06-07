import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { COMPLEXITY_TIERS, computeQuote } from '@/lib/pricing'
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
    await db.workRequest.update({
      where: { id },
      data: {
        tier: quote.tier,
        humanHours: quote.humanHours,
        quoteTotal: quote.total,
        quoteSnapshot: quote as unknown as Prisma.InputJsonValue,
        status: 'QUOTED',
        quotedAt: new Date(),
        // Re-quoting resets a prior customer authorization.
        approvedByCustomer: false,
        customerApprover: null,
      },
    })
    await audit('william_morrison', 'work.request.quote', id, { tier: quote.tier, total: quote.total })
    return Response.json({ success: true, data: quote } satisfies APIResponse<typeof quote>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Quote failed' },
      { status: 500 }
    )
  }
}
