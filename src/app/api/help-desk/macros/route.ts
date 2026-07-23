import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { HELP_DESK_MACROS } from '@/lib/help-desk'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

export interface MacroChip {
  id: string
  label: string
  body: string
  source: 'builtin' | 'article'
  slug?: string
}

/**
 * Macro library for Help Desk reply insert.
 * Builtins + HelpArticles tagged isMacro or tags include "macro".
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const articles = await db.helpArticle.findMany({
      where: {
        OR: [{ isMacro: true }, { tags: { has: 'macro' } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: { id: true, slug: true, title: true, body: true },
    })

    const builtins: MacroChip[] = HELP_DESK_MACROS.map((m) => ({
      id: m.id,
      label: m.label,
      body: m.body,
      source: 'builtin',
    }))

    const fromArticles: MacroChip[] = articles.map((a) => ({
      id: a.id,
      label: a.title.slice(0, 40),
      body: a.body.slice(0, 4000),
      source: 'article',
      slug: a.slug,
    }))

    return Response.json({
      success: true,
      data: [...builtins, ...fromArticles],
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<MacroChip[]>, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Macros failed',
      },
      { status: 500 }
    )
  }
}
