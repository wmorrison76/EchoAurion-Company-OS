import type { RenderDeployHealth } from '@/types/dr-os'
import type { StatusLevel } from '@/types'

const RENDER_API = 'https://api.render.com/v1'

interface RenderDeploy {
  id: string
  status: string // "live" | "build_in_progress" | "update_in_progress" | "build_failed" | ...
  createdAt: string
  finishedAt?: string | null
}

function mapStatus(status: string): { level: StatusLevel; label: RenderDeployHealth['label'] } {
  if (status === 'live') return { level: 'ok', label: 'Live' }
  if (status.includes('failed') || status === 'canceled' || status === 'deactivated')
    return { level: 'error', label: 'Failed' }
  if (status.includes('progress') || status === 'created' || status === 'queued')
    return { level: 'warn', label: 'Deploying' }
  return { level: 'unknown', label: 'Unknown' }
}

export async function getRenderDeployHealth(): Promise<RenderDeployHealth> {
  const apiKey = process.env.RENDER_API_KEY
  const serviceId = process.env.RENDER_SERVICE_ID

  if (!apiKey || !serviceId) {
    return {
      level: 'unknown',
      label: 'Unknown',
      deployId: null,
      triggeredAt: null,
      durationSeconds: null,
      error: 'Render not configured',
    }
  }

  try {
    const res = await fetch(`${RENDER_API}/services/${serviceId}/deploys?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Render API ${res.status}`)

    // Render returns [{ deploy: {...}, cursor }]
    const body = (await res.json()) as Array<{ deploy: RenderDeploy }>
    const deploy = body[0]?.deploy
    if (!deploy) {
      return {
        level: 'unknown',
        label: 'Unknown',
        deployId: null,
        triggeredAt: null,
        durationSeconds: null,
        error: 'No deploys found',
      }
    }

    const { level, label } = mapStatus(deploy.status)
    const duration =
      deploy.finishedAt && deploy.createdAt
        ? Math.round(
            (new Date(deploy.finishedAt).getTime() - new Date(deploy.createdAt).getTime()) / 1000
          )
        : null

    return {
      level,
      label,
      deployId: deploy.id,
      triggeredAt: deploy.createdAt,
      durationSeconds: duration,
    }
  } catch (error) {
    return {
      level: 'unknown',
      label: 'Unknown',
      deployId: null,
      triggeredAt: null,
      durationSeconds: null,
      error: error instanceof Error ? error.message : 'Render request failed',
    }
  }
}
