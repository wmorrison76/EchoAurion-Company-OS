import { db } from '@/lib/db'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * Public Help Center lite — property-facing articles only (`public=true`).
 * No auth. No PII. No draft/internal macros.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
    const slug = url.searchParams.get('slug')?.trim()

    if (slug) {
      const article = await db.helpArticle.findFirst({
        where: { slug, public: true },
        select: {
          id: true,
          slug: true,
          title: true,
          body: true,
          tags: true,
          panelId: true,
          updatedAt: true,
        },
      })
      if (!article) {
        return Response.json({ success: false, error: 'Not found' }, { status: 404 })
      }
      return Response.json({
        success: true,
        data: {
          ...article,
          updatedAt: article.updatedAt.toISOString(),
        },
      })
    }

    const articles = await db.helpArticle.findMany({
      where: { public: true },
      orderBy: { updatedAt: 'desc' },
      take: 60,
      select: {
        id: true,
        slug: true,
        title: true,
        body: true,
        tags: true,
        panelId: true,
        updatedAt: true,
      },
    })

    const filtered = q
      ? articles.filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            a.body.toLowerCase().includes(q) ||
            a.tags.some((t) => t.toLowerCase().includes(q))
        )
      : articles

    return Response.json({
      success: true,
      data: filtered.map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        /** Excerpt only in list — full body on ?slug= */
        excerpt: a.body.slice(0, 240),
        tags: a.tags,
        panelId: a.panelId,
        updatedAt: a.updatedAt.toISOString(),
      })),
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<
      Array<{
        id: string
        slug: string
        title: string
        excerpt: string
        tags: string[]
        panelId: string | null
        updatedAt: string
      }>
    >)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Help Center failed',
      },
      { status: 500 }
    )
  }
}
