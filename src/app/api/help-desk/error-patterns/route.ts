import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/help-desk/error-patterns
 * Aggregated fleet error trends (no PII) for Knowledge Plane / Help Desk analytics.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const productLine = url.searchParams.get('productLine')?.trim() || undefined
    const category = url.searchParams.get('category')?.trim() || undefined
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200)

    const rows = await db.errorPattern.findMany({
      where: {
        ...(productLine ? { productLine } : {}),
        ...(category
          ? {
              errorCategory: category as
                | 'UI'
                | 'API'
                | 'AUTH'
                | 'DATA'
                | 'INTEGRATION'
                | 'INFRA'
                | 'UNKNOWN',
            }
          : {}),
      },
      orderBy: [{ hitCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: limit,
    })

    const byCategory = await db.errorPattern.groupBy({
      by: ['errorCategory'],
      _sum: { hitCount: true },
      _count: { _all: true },
    })

    const byProduct = await db.errorPattern.groupBy({
      by: ['productLine'],
      _sum: { hitCount: true },
      _count: { _all: true },
    })

    const byScope = await db.errorPattern.groupBy({
      by: ['errorScope'],
      _sum: { hitCount: true },
      _count: { _all: true },
    })

    return Response.json({
      success: true,
      data: {
        patterns: rows.map((r) => ({
          id: r.id,
          fingerprint: r.fingerprint,
          errorCategory: r.errorCategory,
          errorScope: r.errorScope,
          productLine: r.productLine,
          moduleHint: r.moduleHint,
          errorClass: r.errorClass,
          sampleMessage: r.sampleMessage,
          hitCount: r.hitCount,
          distinctClients: r.distinctClients,
          firstSeenAt: r.firstSeenAt.toISOString(),
          lastSeenAt: r.lastSeenAt.toISOString(),
          lastTicketId: r.lastTicketId,
        })),
        rollup: {
          byCategory: byCategory.map((g) => ({
            key: g.errorCategory,
            hits: g._sum.hitCount ?? 0,
            patterns: g._count._all,
          })),
          byProduct: byProduct.map((g) => ({
            key: g.productLine,
            hits: g._sum.hitCount ?? 0,
            patterns: g._count._all,
          })),
          byScope: byScope.map((g) => ({
            key: g.errorScope,
            hits: g._sum.hitCount ?? 0,
            patterns: g._count._all,
          })),
        },
      },
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<{
      patterns: Array<Record<string, unknown>>
      rollup: {
        byCategory: Array<{ key: string; hits: number; patterns: number }>
        byProduct: Array<{ key: string; hits: number; patterns: number }>
        byScope: Array<{ key: string; hits: number; patterns: number }>
      }
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error patterns fetch failed',
      },
      { status: 500 }
    )
  }
}
