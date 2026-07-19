import type { RenderDeployHealth } from '@/types/dr-os'
import type { StatusLevel } from '@/types'

const RENDER_API = 'https://api.render.com/v1'

interface RenderDeploy {
  id: string
  status: string // "live" | "build_in_progress" | "update_in_progress" | "build_failed" | ...
  createdAt: string
  finishedAt?: string | null
  commit?: { id?: string; message?: string } | null
}

export interface RenderServiceSummary {
  id: string
  name: string
  type: string
  region: string | null
  url: string | null
  suspended: boolean
  updatedAt: string | null
  createdAt: string | null
  numInstances: number
  branch: string | null
  autoDeploy: boolean
}

export interface RenderServiceWithDeploy extends RenderServiceSummary {
  deploy: {
    id: string | null
    status: string | null
    level: StatusLevel
    label: string
    triggeredAt: string | null
    durationSeconds: number | null
    commitSha: string | null
  }
}

function mapStatus(status: string): { level: StatusLevel; label: RenderDeployHealth['label'] } {
  if (status === 'live') return { level: 'ok', label: 'Live' }
  if (status.includes('failed') || status === 'canceled' || status === 'deactivated')
    return { level: 'error', label: 'Failed' }
  if (status.includes('progress') || status === 'created' || status === 'queued')
    return { level: 'warn', label: 'Deploying' }
  return { level: 'unknown', label: 'Unknown' }
}

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
}

export async function getRenderDeployHealth(): Promise<RenderDeployHealth> {
  const apiKey = process.env.RENDER_API_KEY
  const serviceId = process.env.RENDER_SERVICE_ID

  if (!apiKey || !serviceId) {
    const missing = [
      !apiKey ? 'RENDER_API_KEY' : null,
      !serviceId ? 'RENDER_SERVICE_ID' : null,
    ]
      .filter(Boolean)
      .join(' + ')
    return {
      level: 'unknown',
      label: 'Not configured',
      deployId: null,
      triggeredAt: null,
      durationSeconds: null,
      error: `Render not configured — set ${missing} on Render (William paste; Knights cannot)`,
    }
  }

  try {
    const deploy = await fetchLatestDeploy(apiKey, serviceId)
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

export interface RenderDeployHistoryItem {
  id: string
  status: string
  level: StatusLevel
  label: string
  triggeredAt: string
  finishedAt: string | null
  durationSeconds: number | null
  commitSha: string | null
  commitMessage: string | null
}

async function fetchDeploys(
  apiKey: string,
  serviceId: string,
  limit = 1
): Promise<RenderDeploy[]> {
  const res = await fetch(`${RENDER_API}/services/${serviceId}/deploys?limit=${limit}`, {
    headers: authHeaders(apiKey),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Render API ${res.status}`)
  const body = (await res.json()) as Array<{ deploy: RenderDeploy }>
  return body.map((row) => row.deploy).filter(Boolean)
}

async function fetchLatestDeploy(apiKey: string, serviceId: string): Promise<RenderDeploy | null> {
  const list = await fetchDeploys(apiKey, serviceId, 1)
  return list[0] ?? null
}

/** Recent deploys for Fleet Nexus detail (Render API allows history). */
export async function listRenderDeployHistory(
  serviceId: string,
  limit = 5
): Promise<RenderDeployHistoryItem[]> {
  const apiKey = process.env.RENDER_API_KEY
  if (!apiKey || !serviceId) return []
  try {
    const deploys = await fetchDeploys(apiKey, serviceId, Math.min(limit, 10))
    return deploys.map((deploy) => {
      const { level, label } = mapStatus(deploy.status)
      const duration =
        deploy.finishedAt && deploy.createdAt
          ? Math.round(
              (new Date(deploy.finishedAt).getTime() - new Date(deploy.createdAt).getTime()) / 1000
            )
          : null
      return {
        id: deploy.id,
        status: deploy.status,
        level,
        label,
        triggeredAt: deploy.createdAt,
        finishedAt: deploy.finishedAt ?? null,
        durationSeconds: duration,
        commitSha: deploy.commit?.id?.slice(0, 7) ?? null,
        commitMessage: deploy.commit?.message?.slice(0, 80) ?? null,
      }
    })
  } catch {
    return []
  }
}

/**
 * List all services in the Render account (paginated). Used by Fleet Nexus.
 * Returns [] when RENDER_API_KEY is unset — callers degrade gracefully.
 */
export async function listRenderServices(): Promise<RenderServiceSummary[]> {
  const apiKey = process.env.RENDER_API_KEY
  if (!apiKey) return []

  const services: RenderServiceSummary[] = []
  let cursor: string | undefined

  try {
    for (let page = 0; page < 10; page++) {
      const url = new URL(`${RENDER_API}/services`)
      url.searchParams.set('limit', '50')
      if (cursor) url.searchParams.set('cursor', cursor)

      const res = await fetch(url.toString(), {
        headers: authHeaders(apiKey),
        signal: AbortSignal.timeout(12_000),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Render API ${res.status}`)

      const body = (await res.json()) as Array<{
        service: {
          id: string
          name: string
          type: string
          suspended?: string | boolean
          updatedAt?: string
          createdAt?: string
          branch?: string
          autoDeploy?: string | boolean
          serviceDetails?: {
            url?: string
            region?: string
            numInstances?: number
          }
        }
        cursor?: string
      }>

      if (!Array.isArray(body) || body.length === 0) break

      for (const row of body) {
        const s = row.service
        if (!s?.id) continue
        const suspended =
          s.suspended === true || s.suspended === 'suspended' || String(s.suspended) === 'suspended'
        services.push({
          id: s.id,
          name: s.name,
          type: s.type,
          region: s.serviceDetails?.region ?? null,
          url: s.serviceDetails?.url ?? null,
          suspended,
          updatedAt: s.updatedAt ?? null,
          createdAt: s.createdAt ?? null,
          numInstances: s.serviceDetails?.numInstances ?? 1,
          branch: s.branch ?? null,
          autoDeploy: s.autoDeploy === true || s.autoDeploy === 'yes',
        })
        if (row.cursor) cursor = row.cursor
      }

      if (body.length < 50) break
    }
  } catch {
    return services
  }

  return services
}

/**
 * Enrich each service with its latest deploy status. Caps concurrency to avoid
 * Render rate limits when the account has many services.
 */
export async function listRenderServicesWithDeploys(): Promise<RenderServiceWithDeploy[]> {
  const apiKey = process.env.RENDER_API_KEY
  const services = await listRenderServices()
  if (!apiKey || services.length === 0) return []

  const CONCURRENCY = 5
  const out: RenderServiceWithDeploy[] = []

  for (let i = 0; i < services.length; i += CONCURRENCY) {
    const chunk = services.slice(i, i + CONCURRENCY)
    const enriched = await Promise.all(
      chunk.map(async (svc): Promise<RenderServiceWithDeploy> => {
        try {
          const deploy = await fetchLatestDeploy(apiKey, svc.id)
          if (!deploy) {
            return {
              ...svc,
              deploy: {
                id: null,
                status: null,
                level: svc.suspended ? 'error' : 'unknown',
                label: svc.suspended ? 'Suspended' : 'Unknown',
                triggeredAt: null,
                durationSeconds: null,
                commitSha: null,
              },
            }
          }
          const { level, label } = mapStatus(deploy.status)
          const duration =
            deploy.finishedAt && deploy.createdAt
              ? Math.round(
                  (new Date(deploy.finishedAt).getTime() - new Date(deploy.createdAt).getTime()) /
                    1000
                )
              : null
          return {
            ...svc,
            deploy: {
              id: deploy.id,
              status: deploy.status,
              level: svc.suspended ? 'error' : level,
              label: svc.suspended ? 'Suspended' : label,
              triggeredAt: deploy.createdAt,
              durationSeconds: duration,
              commitSha: deploy.commit?.id?.slice(0, 7) ?? null,
            },
          }
        } catch {
          return {
            ...svc,
            deploy: {
              id: null,
              status: null,
              level: 'unknown',
              label: 'Unknown',
              triggeredAt: null,
              durationSeconds: null,
              commitSha: null,
            },
          }
        }
      })
    )
    out.push(...enriched)
  }

  return out
}
