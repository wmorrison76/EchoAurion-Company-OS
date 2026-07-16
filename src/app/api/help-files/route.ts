import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toArticleView, slugify } from '@/lib/help-files'
import { isKnownPanelId } from '@/lib/help-panels'
import type { APIResponse } from '@/types'
import type { HelpArticleView } from '@/types/help-files'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const rows = await db.helpArticle.findMany({ orderBy: { updatedAt: 'desc' } })
    return Response.json({
      success: true,
      data: rows.map(toArticleView),
      meta: { lastUpdated: new Date().toISOString() },
    } satisfies APIResponse<HelpArticleView[]>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'List failed' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      slug?: string
      title?: string
      body?: string
      tags?: string[]
      panelId?: string | null
      public?: boolean
      isMacro?: boolean
    }

    const title = body.title?.trim()
    const articleBody = body.body?.trim()
    if (!title || !articleBody) {
      return Response.json(
        { success: false, error: 'title and body are required' },
        { status: 400 }
      )
    }

    const slug = (body.slug?.trim() || slugify(title)).toLowerCase()
    if (!slug) {
      return Response.json({ success: false, error: 'slug is required' }, { status: 400 })
    }

    const panelId = body.panelId?.trim() || null
    if (panelId && !isKnownPanelId(panelId)) {
      return Response.json(
        { success: false, error: `Unknown panelId: ${panelId}` },
        { status: 400 }
      )
    }

    const tags = (body.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)

    const created = await db.helpArticle.create({
      data: {
        slug,
        title,
        body: articleBody,
        tags,
        panelId,
        public: body.public === true,
        isMacro: body.isMacro === true,
      },
    })

    await audit('william_morrison', 'help_files.article.create', created.id, { slug })

    // Ops/public Help Files → Echo learning plane (PII-scrubbed).
    if (
      created.public === true ||
      created.isMacro === true ||
      tags.some((t) => /^(ops|public|procedure|runbook|macro|help)$/i.test(t))
    ) {
      const { queueLearnFromHelp } = await import('@/lib/echo-learning')
      void queueLearnFromHelp(created.id).catch(() => {})
    }

    return Response.json({
      success: true,
      data: toArticleView(created),
    } satisfies APIResponse<HelpArticleView>)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Create failed'
    const status = msg.includes('Unique constraint') ? 409 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      id?: string
      slug?: string
      title?: string
      body?: string
      tags?: string[]
      panelId?: string | null
      public?: boolean
      isMacro?: boolean
    }

    if (!body.id) {
      return Response.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    const existing = await db.helpArticle.findUnique({ where: { id: body.id } })
    if (!existing) {
      return Response.json({ success: false, error: 'Article not found' }, { status: 404 })
    }

    const panelId =
      body.panelId === undefined
        ? undefined
        : body.panelId === null || body.panelId === ''
          ? null
          : body.panelId.trim()

    if (panelId && !isKnownPanelId(panelId)) {
      return Response.json(
        { success: false, error: `Unknown panelId: ${panelId}` },
        { status: 400 }
      )
    }

    const updated = await db.helpArticle.update({
      where: { id: body.id },
      data: {
        ...(body.slug !== undefined ? { slug: body.slug.trim().toLowerCase() } : {}),
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.body !== undefined ? { body: body.body.trim() } : {}),
        ...(body.tags !== undefined
          ? { tags: body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) }
          : {}),
        ...(panelId !== undefined ? { panelId } : {}),
        ...(body.public !== undefined ? { public: body.public } : {}),
        ...(body.isMacro !== undefined ? { isMacro: body.isMacro } : {}),
      },
    })

    await audit('william_morrison', 'help_files.article.update', updated.id)

    if (
      updated.public === true ||
      updated.isMacro === true ||
      updated.tags.some((t) => /^(ops|public|procedure|runbook|macro|help)$/i.test(t))
    ) {
      const { queueLearnFromHelp } = await import('@/lib/echo-learning')
      void queueLearnFromHelp(updated.id).catch(() => {})
    }

    return Response.json({
      success: true,
      data: toArticleView(updated),
    } satisfies APIResponse<HelpArticleView>)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    )
  }
}
