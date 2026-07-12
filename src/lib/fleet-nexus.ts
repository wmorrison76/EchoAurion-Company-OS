import { formatDistanceToNow } from 'date-fns'
import { db } from '@/lib/db'
import {
  listRenderDeployHistory,
  listRenderServicesWithDeploys,
  type RenderServiceWithDeploy,
} from '@/lib/render'
import type { ClientHealth } from '@/types/support'
import type {
  FleetDataMode,
  FleetDeployHistoryItem,
  FleetEdge,
  FleetGraph,
  FleetHealth,
  FleetNode,
  FleetNexusPayload,
  FleetScope,
} from '@/types/fleet-nexus'

function clientHealthToFleet(h: ClientHealth): FleetHealth {
  if (h === 'GREEN') return 'ok'
  if (h === 'AMBER') return 'warn'
  if (h === 'RED') return 'error'
  return 'unknown'
}

function statusToFleet(level: string): FleetHealth {
  if (level === 'ok') return 'ok'
  if (level === 'warn') return 'warn'
  if (level === 'error') return 'error'
  return 'unknown'
}

function ago(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

interface SupportRow {
  id: string
  clientKey: string
  label: string
  property: string | null
  health: ClientHealth
  appVersion: string | null
  platform: string | null
  online: boolean
  queueDepth: number
  errorCount: number
  lastSyncAt: string | null
  lastSeenAt: string | null
}

async function loadSupportClients(): Promise<SupportRow[]> {
  try {
    const clients = await db.supportClient.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { snapshots: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    return clients.map((c) => {
      const s = c.snapshots[0]
      return {
        id: c.id,
        clientKey: c.clientKey,
        label: c.label,
        property: c.property,
        health: (s?.health as ClientHealth) ?? 'UNKNOWN',
        appVersion: s?.appVersion ?? null,
        platform: s?.platform ?? null,
        online: s?.online ?? false,
        queueDepth: s?.queueDepth ?? 0,
        errorCount: s?.errorCount ?? 0,
        lastSyncAt: s?.lastSyncAt?.toISOString() ?? null,
        lastSeenAt: s?.createdAt.toISOString() ?? null,
      }
    })
  } catch {
    return []
  }
}

function isCompanyOsService(svc: RenderServiceWithDeploy): boolean {
  const primary = process.env.RENDER_SERVICE_ID
  if (primary && svc.id === primary) return true
  const n = svc.name.toLowerCase()
  return n.includes('company-os') || n.includes('company_os') || n.includes('echoaurion-company')
}

function isProductish(svc: RenderServiceWithDeploy): boolean {
  if (isCompanyOsService(svc)) return false
  const n = svc.name.toLowerCase()
  return (
    n.includes('echo') ||
    n.includes('luccca') ||
    n.includes('aurion') ||
    svc.type === 'web_service' ||
    svc.type === 'web'
  )
}

function matchClientToService(client: SupportRow, services: RenderServiceWithDeploy[]): string | null {
  const hay = `${client.label} ${client.property ?? ''} ${client.clientKey}`.toLowerCase()
  for (const svc of services) {
    if (isCompanyOsService(svc)) continue
    const name = svc.name.toLowerCase()
    if (name.length >= 4 && hay.includes(name)) return `render/${svc.id}`
  }
  // Prefer a product web service as default parent when we can't match.
  const product = services.find((s) => isProductish(s) && !isCompanyOsService(s))
  return product ? `render/${product.id}` : null
}

function finalizeGraph(nodes: FleetNode[], edges: FleetEdge[], scope: FleetScope, title: string, fleetVersion: string | null): FleetGraph {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const n of nodes) {
    n.deps = []
    n.dependents = []
    n.reach = []
  }
  for (const e of edges) {
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) continue
    // Edge source → target means source depends on target (traffic toward dependency).
    if (!src.deps.includes(e.target)) src.deps.push(e.target)
    if (!src.reach.includes(e.target)) src.reach.push(e.target)
    if (!tgt.dependents.includes(e.source)) tgt.dependents.push(e.source)
  }
  return { scope, title, fleetVersion, nodes, edges }
}

function buildFleetGraph(
  services: RenderServiceWithDeploy[],
  clients: SupportRow[],
  deployHistoryByService: Map<string, FleetDeployHistoryItem[]>
): FleetGraph {
  const nodes: FleetNode[] = []
  const edges: FleetEdge[] = []

  const versions = services
    .map((s) => s.deploy.commitSha)
    .filter((v): v is string => Boolean(v))
  const fleetVersion =
    versions.sort(
      (a, b) => versions.filter((v) => v === b).length - versions.filter((v) => v === a).length
    )[0] ?? null

  for (const svc of services) {
    const id = `render/${svc.id}`
    const company = isCompanyOsService(svc)
    const history = deployHistoryByService.get(svc.id) ?? []
    nodes.push({
      id,
      label: svc.name,
      kind: company ? 'platform' : svc.type.includes('cron') ? 'infra' : 'deployment',
      health: statusToFleet(svc.deploy.level),
      weight: Math.max(1, svc.numInstances) * 40,
      version: svc.deploy.commitSha,
      instances: svc.numInstances,
      errPct: svc.deploy.level === 'error' ? 5 : svc.deploy.level === 'warn' ? 1 : 0,
      p95: 0,
      cpu: 0,
      mem: 0,
      meta: {
        region: svc.region ?? undefined,
        serviceType: svc.type,
        suspended: svc.suspended,
        url: svc.url ?? undefined,
        lastDeploy: ago(svc.deploy.triggeredAt),
        deployStatus: svc.deploy.label,
        source: 'render',
        branch: svc.branch,
        deployHistory: history,
      },
      deps: [],
      dependents: [],
      reach: [],
    })
  }

  const companyNode = nodes.find((n) => n.kind === 'platform')

  for (const c of clients) {
    const id = `support/${c.id}`
    const parent = matchClientToService(c, services)
    nodes.push({
      id,
      label: c.label,
      kind: 'client',
      health: clientHealthToFleet(c.health),
      weight: 20 + Math.min(80, c.queueDepth + c.errorCount * 5),
      version: c.appVersion,
      instances: 1,
      errPct: c.errorCount,
      p95: 0,
      cpu: 0,
      mem: 0,
      meta: {
        property: c.property,
        appVersion: c.appVersion,
        platform: c.platform,
        online: c.online,
        queueDepth: c.queueDepth,
        errorCount: c.errorCount,
        lastSeenAt: ago(c.lastSeenAt),
        source: 'support',
        clientKey: c.clientKey,
        clientHealthLabel: c.health,
      },
      deps: [],
      dependents: [],
      reach: [],
    })
    // Client depends on its matched product service (blast radius: service → clients).
    if (parent) {
      edges.push({ source: id, target: parent, weight: 30 + c.queueDepth })
    } else if (companyNode) {
      edges.push({ source: id, target: companyNode.id, weight: 15 })
    }
  }

  const title =
    services.length || clients.length
      ? `Fleet — ${services.length} Render service${services.length === 1 ? '' : 's'}, ${clients.length} support client${clients.length === 1 ? '' : 's'}`
      : 'Fleet — no live nodes yet'

  return finalizeGraph(nodes, edges, 'fleet', title, fleetVersion)
}

function buildChainGraph(clients: SupportRow[]): FleetGraph {
  const nodes: FleetNode[] = []
  const edges: FleetEdge[] = []

  if (clients.length === 0) {
    return finalizeGraph(
      nodes,
      edges,
      'chain',
      'Chain — no support clients yet (property tree empty)',
      null
    )
  }

  const byProperty = new Map<string, SupportRow[]>()
  for (const c of clients) {
    const key = c.property?.trim() || 'Ungrouped'
    const list = byProperty.get(key) ?? []
    list.push(c)
    byProperty.set(key, list)
  }

  for (const [property, members] of byProperty) {
    const hqId = `hq/${slug(property)}`
    const RANK: Record<FleetHealth, number> = { ok: 0, unknown: 1, warn: 2, error: 3 }
    const worst = members.reduce<FleetHealth>((acc, m) => {
      const h = clientHealthToFleet(m.health)
      return RANK[h] > RANK[acc] ? h : acc
    }, 'ok')

    nodes.push({
      id: hqId,
      label: `${property} (HQ)`,
      kind: 'hq',
      health: worst,
      weight: 50 + members.length * 10,
      version: null,
      instances: 1,
      errPct: members.reduce((s, m) => s + m.errorCount, 0),
      p95: 0,
      cpu: 0,
      mem: 0,
      meta: {
        property,
        source: 'derived',
        entities: members.length,
      },
      deps: [],
      dependents: [],
      reach: [],
    })

    for (const c of members) {
      const id = `entity/${c.id}`
      nodes.push({
        id,
        label: c.label,
        kind: 'entity',
        health: clientHealthToFleet(c.health),
        weight: 25 + Math.min(60, c.queueDepth),
        version: c.appVersion,
        instances: 1,
        errPct: c.errorCount,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: {
          property: c.property,
          appVersion: c.appVersion,
          online: c.online,
          queueDepth: c.queueDepth,
          errorCount: c.errorCount,
          lastSeenAt: ago(c.lastSeenAt),
          source: 'support',
          clientHealthLabel: c.health,
        },
        deps: [],
        dependents: [],
        reach: [],
      })
      edges.push({ source: id, target: hqId, weight: 20 })
    }
  }

  return finalizeGraph(
    nodes,
    edges,
    'chain',
    `Chain — ${byProperty.size} propert${byProperty.size === 1 ? 'y' : 'ies'} · ${clients.length} client${clients.length === 1 ? '' : 's'}`,
    null
  )
}

function buildDeploymentGraph(
  services: RenderServiceWithDeploy[],
  clients: SupportRow[]
): FleetGraph {
  const nodes: FleetNode[] = []
  const edges: FleetEdge[] = []

  const primaryId = process.env.RENDER_SERVICE_ID
  const primary =
    services.find((s) => s.id === primaryId) ??
    services.find((s) => isProductish(s)) ??
    services[0]

  if (!primary && clients.length === 0) {
    return finalizeGraph(
      nodes,
      edges,
      'deployment',
      'Deployment — no Render service or support data',
      null
    )
  }

  if (primary) {
    const svcId = `render/${primary.id}`
    nodes.push({
      id: svcId,
      label: primary.name,
      kind: 'edge',
      health: statusToFleet(primary.deploy.level),
      weight: 80,
      version: primary.deploy.commitSha,
      instances: primary.numInstances,
      errPct: primary.deploy.level === 'error' ? 5 : 0,
      p95: 0,
      cpu: 0,
      mem: 0,
      meta: {
        region: primary.region ?? undefined,
        serviceType: primary.type,
        url: primary.url ?? undefined,
        lastDeploy: ago(primary.deploy.triggeredAt),
        deployStatus: primary.deploy.label,
        source: 'render',
        note: 'Internal service map requires product /api/admin/nexus-snapshot (not wired)',
      },
      deps: [],
      dependents: [],
      reach: [],
    })

    // Honest stubs: we know Neon + Render exist as external deps of the app,
    // but we do not invent CPU/RPS. Mark as unknown derived nodes.
    const stubs: Array<{ id: string; label: string; kind: FleetNode['kind'] }> = [
      { id: 'ext/render-platform', label: 'Render platform', kind: 'external' },
      { id: 'db/company-os-neon', label: 'Company OS Neon DB', kind: 'datastore' },
    ]
    for (const stub of stubs) {
      nodes.push({
        id: stub.id,
        label: stub.label,
        kind: stub.kind,
        health: 'unknown',
        weight: 40,
        version: null,
        instances: 1,
        errPct: 0,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: { source: 'derived', note: 'Presence inferred — no live metrics in v1' },
        deps: [],
        dependents: [],
        reach: [],
      })
      edges.push({ source: svcId, target: stub.id, weight: 20 })
    }

    const linked = clients.filter((c) => matchClientToService(c, services) === svcId)
    for (const c of linked.length ? linked : clients.slice(0, 8)) {
      const id = `support/${c.id}`
      nodes.push({
        id,
        label: c.label,
        kind: 'client',
        health: clientHealthToFleet(c.health),
        weight: 25,
        version: c.appVersion,
        instances: 1,
        errPct: c.errorCount,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: {
          property: c.property,
          queueDepth: c.queueDepth,
          errorCount: c.errorCount,
          online: c.online,
          source: 'support',
        },
        deps: [],
        dependents: [],
        reach: [],
      })
      edges.push({ source: id, target: svcId, weight: 25 })
    }

    return finalizeGraph(
      nodes,
      edges,
      'deployment',
      `Deployment — ${primary.name} (partial · no product snapshot)`,
      primary.deploy.commitSha
    )
  }

  // Support-only fallback
  for (const c of clients) {
    nodes.push({
      id: `support/${c.id}`,
      label: c.label,
      kind: 'client',
      health: clientHealthToFleet(c.health),
      weight: 30,
      version: c.appVersion,
      instances: 1,
      errPct: c.errorCount,
      p95: 0,
      cpu: 0,
      mem: 0,
      meta: { source: 'support', property: c.property },
      deps: [],
      dependents: [],
      reach: [],
    })
  }
  return finalizeGraph(nodes, edges, 'deployment', 'Deployment — support clients only', null)
}

function demoPayload(): FleetNexusPayload {
  const fleet = finalizeGraph(
    [
      {
        id: 'platform/company-os',
        label: 'Company OS (demo)',
        kind: 'platform',
        health: 'ok',
        weight: 60,
        version: 'demo',
        instances: 1,
        errPct: 0,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: { source: 'demo' },
        deps: [],
        dependents: [],
        reach: [],
      },
      {
        id: 'render/demo-product',
        label: 'EchoAurion product (demo)',
        kind: 'deployment',
        health: 'warn',
        weight: 70,
        version: 'demo',
        instances: 1,
        errPct: 1,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: { source: 'demo', region: 'oregon' },
        deps: [],
        dependents: [],
        reach: [],
      },
      {
        id: 'support/demo-client',
        label: 'Miccosukee (demo)',
        kind: 'client',
        health: 'ok',
        weight: 30,
        version: '0.0.0',
        instances: 1,
        errPct: 0,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: { source: 'demo', property: 'Miccosukee Resort & Gaming' },
        deps: [],
        dependents: [],
        reach: [],
      },
    ],
    [
      { source: 'platform/company-os', target: 'render/demo-product', weight: 10 },
      { source: 'support/demo-client', target: 'render/demo-product', weight: 30 },
    ],
    'fleet',
    'Fleet — DEMO (development only)',
    'demo'
  )

  const chain = finalizeGraph(
    [
      {
        id: 'hq/miccosukee',
        label: 'Miccosukee (HQ)',
        kind: 'hq',
        health: 'ok',
        weight: 50,
        version: null,
        instances: 1,
        errPct: 0,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: { source: 'demo' },
        deps: [],
        dependents: [],
        reach: [],
      },
      {
        id: 'entity/demo',
        label: 'Kitchen Line 1 (demo)',
        kind: 'entity',
        health: 'ok',
        weight: 25,
        version: null,
        instances: 1,
        errPct: 0,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: { source: 'demo' },
        deps: [],
        dependents: [],
        reach: [],
      },
    ],
    [{ source: 'entity/demo', target: 'hq/miccosukee', weight: 20 }],
    'chain',
    'Chain — DEMO',
    null
  )

  const deployment = finalizeGraph(
    [
      {
        id: 'edge/web',
        label: 'Web service (demo)',
        kind: 'edge',
        health: 'ok',
        weight: 60,
        version: 'demo',
        instances: 1,
        errPct: 0,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: { source: 'demo' },
        deps: [],
        dependents: [],
        reach: [],
      },
      {
        id: 'db/neon',
        label: 'Neon DB (demo)',
        kind: 'datastore',
        health: 'unknown',
        weight: 40,
        version: null,
        instances: 1,
        errPct: 0,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: { source: 'demo' },
        deps: [],
        dependents: [],
        reach: [],
      },
    ],
    [{ source: 'edge/web', target: 'db/neon', weight: 20 }],
    'deployment',
    'Deployment — DEMO',
    'demo'
  )

  return {
    mode: 'demo',
    banner: 'DEMO MODE — synthetic nodes for local UX only. Not live. Set RENDER_API_KEY for real fleet data.',
    sources: { render: false, support: false, demo: true },
    counts: { renderServices: 0, supportClients: 0, unhealthy: 0, supportRed: 0, supportAmber: 0 },
    graphs: { fleet, chain, deployment },
    generatedAt: new Date().toISOString(),
  }
}

export async function buildFleetNexusPayload(): Promise<FleetNexusPayload> {
  const hasRenderKey = Boolean(process.env.RENDER_API_KEY)
  const [services, clients] = await Promise.all([
    hasRenderKey ? listRenderServicesWithDeploys() : Promise.resolve([]),
    loadSupportClients(),
  ])

  const deployHistoryByService = new Map<string, FleetDeployHistoryItem[]>()
  if (hasRenderKey && services.length > 0) {
    const CONCURRENCY = 4
    for (let i = 0; i < services.length; i += CONCURRENCY) {
      const chunk = services.slice(i, i + CONCURRENCY)
      await Promise.all(
        chunk.map(async (svc) => {
          const hist = await listRenderDeployHistory(svc.id, 5)
          deployHistoryByService.set(
            svc.id,
            hist.map((h) => ({
              id: h.id,
              label: h.label,
              level: statusToFleet(h.level),
              triggeredAt: h.triggeredAt,
              ago: ago(h.triggeredAt),
              commitSha: h.commitSha,
              commitMessage: h.commitMessage,
              durationSeconds: h.durationSeconds,
            }))
          )
        })
      )
    }
  }

  const renderOk = services.length > 0
  const supportOk = clients.length > 0

  if (!renderOk && !supportOk) {
    if (process.env.NODE_ENV === 'development') {
      return demoPayload()
    }
    const empty = (scope: FleetScope, title: string): FleetGraph =>
      finalizeGraph([], [], scope, title, null)
    return {
      mode: 'empty',
      banner:
        'EMPTY — no live fleet data. Set RENDER_API_KEY and/or wait for Support heartbeats (POST /api/relay/heartbeat with SUPPORT_INGEST_SECRET). See docs/CONNECT_PILOT_TO_COMPANY_OS.md. Never shows fake live data in production.',
      sources: { render: false, support: false, demo: false },
      counts: {
        renderServices: 0,
        supportClients: 0,
        unhealthy: 0,
        supportRed: 0,
        supportAmber: 0,
      },
      graphs: {
        fleet: empty('fleet', 'Fleet — empty'),
        chain: empty('chain', 'Chain — empty'),
        deployment: empty('deployment', 'Deployment — empty'),
      },
      generatedAt: new Date().toISOString(),
    }
  }

  const graphs: Record<FleetScope, FleetGraph> = {
    fleet: buildFleetGraph(services, clients, deployHistoryByService),
    chain: buildChainGraph(clients),
    deployment: buildDeploymentGraph(services, clients),
  }

  const supportRed = clients.filter((c) => c.health === 'RED').length
  const supportAmber = clients.filter((c) => c.health === 'AMBER').length
  const unhealthy =
    services.filter((s) => s.deploy.level === 'error' || s.deploy.level === 'warn').length +
    supportRed +
    supportAmber

  const mode: FleetDataMode = renderOk && supportOk ? 'live' : 'partial'
  const parts: string[] = []
  if (renderOk) parts.push(`Render (${services.length} services)`)
  else if (hasRenderKey) parts.push('Render configured but returned 0 services')
  else parts.push('Render not configured')
  if (supportOk) parts.push(`Support (${clients.length} clients · ${supportRed} RED · ${supportAmber} AMBER)`)
  else parts.push('no Support clients yet')

  const banner =
    mode === 'live'
      ? `✓ LIVE — Render + Support · ${parts.join(' · ')}`
      : `⚠ PARTIAL — ${parts.join(' · ')}. Chain/Deployment scopes are thinner without product nexus snapshots.`

  return {
    mode,
    banner,
    sources: { render: renderOk, support: supportOk, demo: false },
    counts: {
      renderServices: services.length,
      supportClients: clients.length,
      unhealthy,
      supportRed,
      supportAmber,
    },
    graphs,
    generatedAt: new Date().toISOString(),
  }
}
