import { db } from '@/lib/db'
import type { HelpArticleView } from '@/types/help-files'

export function toArticleView(a: {
  id: string
  slug: string
  title: string
  body: string
  tags: string[]
  panelId: string | null
  public?: boolean
  isMacro?: boolean
  updatedAt: Date
  createdAt: Date
}): HelpArticleView {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    body: a.body,
    tags: a.tags,
    panelId: a.panelId,
    public: a.public ?? false,
    isMacro: a.isMacro ?? false,
    updatedAt: a.updatedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
  }
}

/** Simple ILIKE search across title, body, slug, and tags. */
export async function searchHelpArticles(q: string, limit = 20): Promise<HelpArticleView[]> {
  const term = q.trim()
  if (!term) {
    const rows = await db.helpArticle.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
    })
    return rows.map(toArticleView)
  }

  const rows = await db.helpArticle.findMany({
    where: {
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { body: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
        { tags: { has: term.toLowerCase() } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })
  return rows.map(toArticleView)
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}
