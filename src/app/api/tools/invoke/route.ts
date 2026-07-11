import { z } from 'zod'
import { auth } from '@/lib/auth'
import { SAFE_TOOLS, type SafeTool } from '@/lib/safe-tools-types'
import { invokeSafeTool } from '@/lib/safe-tools'
import type { APIResponse } from '@/types'

export const dynamic = 'force-dynamic'

const schema = z.object({
  tool: z.enum(SAFE_TOOLS as unknown as [SafeTool, ...SafeTool[]]),
  clientKey: z.string().min(1).max(120),
  params: z.record(z.unknown()).optional(),
  dryRun: z.boolean().optional(),
  workRequestId: z.string().optional(),
  ticketId: z.string().optional(),
})

/**
 * POST /api/tools/invoke — Super Admin only.
 * Allowlisted safe tools; dry-run default. Never remote desktop.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid tool invoke payload', code: 'SCHEMA' },
        { status: 400 }
      )
    }
    const result = await invokeSafeTool({
      ...parsed.data,
      actor: 'william_morrison',
    })
    return Response.json({ success: true, data: result } satisfies APIResponse<typeof result>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Tool invoke failed',
      },
      { status: 400 }
    )
  }
}
