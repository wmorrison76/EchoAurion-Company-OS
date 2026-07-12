import { auth } from '@/lib/auth'
import { buildAnonymizedSnapshot } from '@/lib/system-snapshot'
import { buildFleetNexusPayload } from '@/lib/fleet-nexus'
import type { APIResponse } from '@/types'
import type { AnonymizedSystemSnapshot } from '@/lib/system-snapshot'

export const dynamic = 'force-dynamic'

/**
 * GET /api/fleet-nexus/snapshot — fleet graph mode + anonymized health (auth).
 * Strips any guest/PII; deploy + support aggregates only.
 */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }
  try {
    const [snapshot, fleet] = await Promise.all([
      buildAnonymizedSnapshot(),
      buildFleetNexusPayload(),
    ])
    return Response.json({
      success: true,
      data: {
        snapshot,
        fleet: {
          mode: fleet.mode,
          banner: fleet.banner,
          sources: fleet.sources,
          counts: fleet.counts,
          generatedAt: fleet.generatedAt,
        },
      },
    } satisfies APIResponse<{
      snapshot: AnonymizedSystemSnapshot
      fleet: {
        mode: string
        banner: string
        sources: unknown
        counts: unknown
        generatedAt: string
      }
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Fleet snapshot failed',
      },
      { status: 500 }
    )
  }
}
