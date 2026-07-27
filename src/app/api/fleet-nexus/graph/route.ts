import { auth } from '@/lib/auth'
import { buildFleetNexusPayload } from '@/lib/fleet-nexus'
import type { APIResponse } from '@/types'
import type { FleetNexusPayload } from '@/types/fleet-nexus'

export const dynamic = 'force-dynamic'

/** Aggregates Render services + Support client health into Fleet Nexus graphs. */
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const data = await buildFleetNexusPayload()
    return Response.json({
      success: true,
      data,
      meta: { lastUpdated: data.generatedAt },
    } satisfies APIResponse<FleetNexusPayload>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Fleet Nexus graph failed',
      },
      { status: 500 }
    )
  }
}
