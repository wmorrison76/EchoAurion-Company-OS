import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/help-desk/attachments/[id]
 * Auth'd operator thumbnail / full image. Never logs bytes.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const { id } = await params
    if (!id || id.length > 64) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const row = await db.helpAttachment.findUnique({
      where: { id },
      select: {
        mimeType: true,
        byteSize: true,
        data: true,
        altText: true,
      },
    })
    if (!row) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const body = Buffer.from(row.data)
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': row.mimeType,
        'Content-Length': String(body.length),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        ...(row.altText
          ? { 'Content-Disposition': `inline; filename="screenshot"` }
          : {}),
      },
    })
  } catch (error) {
    console.error('[help-desk/attachments] fetch failed', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Attachment fetch failed',
      },
      { status: 500 }
    )
  }
}
