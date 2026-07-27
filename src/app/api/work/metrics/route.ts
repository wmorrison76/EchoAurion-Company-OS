import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatUSD } from '@/lib/pricing'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * WorkAgreement board metrics — open quotes, hours vs estimate (light).
 * GET /api/work/metrics
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const agreements = await db.workAgreement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        workRequest: {
          select: {
            id: true,
            title: true,
            status: true,
            quoteTotal: true,
            humanHours: true,
            clientKey: true,
          },
        },
      },
    })

    const openQuotes = agreements.filter(
      (a) =>
        a.workRequest &&
        !['EXECUTED', 'ROLLED_BACK', 'DECLINED'].includes(a.workRequest.status)
    )

    const quotedUsd = openQuotes.reduce(
      (s, a) => s + (a.workRequest?.quoteTotal ?? a.quoteTotal ?? 0),
      0
    )
    const quotedHours = openQuotes.reduce(
      (s, a) => s + (a.workRequest?.humanHours ?? 0),
      0
    )

    const data = {
      openQuoteCount: openQuotes.length,
      quotedUsd,
      quotedUsdLabel: formatUSD(quotedUsd),
      quotedHours,
      shape: openQuotes.length > 5 ? '▲' : openQuotes.length > 0 ? '●' : '○',
      label:
        openQuotes.length > 5
          ? 'Busy pipeline'
          : openQuotes.length > 0
            ? 'Open quotes'
            : 'No open quotes',
      recent: openQuotes.slice(0, 15).map((a) => ({
        agreementId: a.id,
        workRequestId: a.workRequestId,
        title: a.workRequest?.title ?? '(untitled)',
        status: a.workRequest?.status ?? 'UNKNOWN',
        quoteTotalLabel: formatUSD(a.workRequest?.quoteTotal ?? a.quoteTotal ?? 0),
        quoteHours: a.workRequest?.humanHours ?? null,
        clientKey: a.workRequest?.clientKey ?? null,
        signedAt: a.agreedAt?.toISOString() ?? null,
      })),
    }

    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<typeof data>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Work metrics failed',
      },
      { status: 500 }
    )
  }
}
