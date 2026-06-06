// Public, unauthenticated health check used by Render (CLAUDE.md §20.2).
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() })
}
