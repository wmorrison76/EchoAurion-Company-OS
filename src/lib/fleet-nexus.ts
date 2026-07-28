import { formatDistanceToNow } from 'date-fns'
import { db } from '@/lib/db'
import {
  listRenderDeployHistory,
  listRenderServicesWithDeploys,
  type RenderServiceWithDeploy,
} from '@/lib/render'
import {
  loadLatestProductNexusSnapshots,
  productSnapshotToFleet,
  type StoredProductNexus,
} from '@/lib/product-nexus'
import type { ClientHealth } from '@/types/support'
import type {
  FleetConfigDebtItem,
  FleetDataMode,
  FleetDeployHistoryItem,
  FleetEdge,
  FleetGraph,
  FleetHealth,
  FleetNode,
  FleetNexusPayload,
  FleetScope,
} from '@/types/fleet-nexus'
import { computePropertyReliabilityMap } from '@/lib/property-reliability'

const ONLINE_MS = 5 * 60 * 1000
const OPEN_TICKET_STATUSES = ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] as const

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
  lastHeartbeatAt: string | null
  lastSeenAt: string | null
  unknownReason: string | null
  openTickets: number
  openSystemTickets: number
}

function resolveClientHealth(
  snapshotHealth: ClientHealth | null | undefined,
  lastHealth: string | null | undefined
): ClientHealth {
  if (snapshotHealth && snapshotHealth !== 'UNKNOWN') return snapshotHealth
  const lh = lastHealth as ClientHealth | null | undefined
  if (lh && lh !== 'UNKNOWN') return lh
  return snapshotHealth ?? lh ?? 'UNKNOWN'
}

function computeUnknownReason(input: {
  health: ClientHealth
  lastHeartbeatAt: Date | null
  hasSnapshot: boolean
  online: boolean
}): string | null {
  if (input.health !== 'UNKNOWN') return null
  const now = Date.now()
  if (!input.lastHeartbeatAt) {
    return input.hasSnapshot
      ? 'Diagnostics stale — no recent heartbeat (check SUPPORT_INGEST_SECRET on pilot + Company OS)'
      : 'No heartbeat yet — open pilot app or verify SUPPORT_INGEST_SECRET matches COMPANY_OS_INGEST_SECRET'
  }
  const ageMs = now - input.lastHeartbeatAt.getTime()
  if (ageMs > ONLINE_MS) {
    return `Heartbeat stale — last seen ${formatDistanceToNow(input.lastHeartbeatAt, { addSuffix: true })}`
  }
  if (!input.hasSnapshot) {
    return 'Heartbeat only — POST /api/support/diagnostics for full health (queue/errors/sync)'
  }
  if (!input.online) {
    return 'Pilot reported offline on last diagnostics'
  }
  return 'Health not computed — awaiting diagnostics bundle'
}

async function loadTicketCounts(
  clientKeys: string[]
): Promise<Map<string, { open: number; system: number }>> {
  const map = new Map<string, { open: number; system: number }>()
  if (clientKeys.length === 0) return map
  try {
    const rows = await db.helpTicket.findMany({
      where: {
        clientKey: { in: clientKeys },
        status: { in: [...OPEN_TICKET_STATUSES] },
      },
      select: { clientKey: true, errorScope: true },
    })
    for (const row of rows) {
      if (!row.clientKey) continue
      const cur = map.get(row.clientKey) ?? { open: 0, system: 0 }
      cur.open += 1
      if (row.errorScope && ['GLOBAL', 'COHORT', 'ACCOUNT'].includes(row.errorScope)) {
        cur.system += 1
      }
      map.set(row.clientKey, cur)
    }
  } catch {
    // degrade gracefully
  }
  return map
}

async function loadSupportClients(): Promise<SupportRow[]> {
  try {
    const clients = await db.supportClient.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { snapshots: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    const keys = clients.map((c) => c.clientKey)
    const tickets = await loadTicketCounts(keys)

    return clients.map((c) => {
      const s = c.snapshots[0]
      const snapshotHealth = s?.health as ClientHealth | undefined
      const health = resolveClientHealth(snapshotHealth, c.lastHealth)
      const lastHeartbeatAt = c.lastHeartbeatAt ?? s?.createdAt ?? null
      const tc = tickets.get(c.clientKey) ?? { open: 0, system: 0 }
      const online = s?.online ?? (c.lastHeartbeatAt ? Date.now() - c.lastHeartbeatAt.getTime() < ONLINE_MS : false)
      return {
        id: c.id,
        clientKey: c.clientKey,
        label: c.label,
        property: c.property,
        health,
        appVersion: s?.appVersion ?? null,
        platform: s?.platform ?? null,
        online,
        queueDepth: s?.queueDepth ?? 0,
        errorCount: s?.errorCount ?? 0,
        lastSyncAt: s?.lastSyncAt?.toISOString() ?? null,
        lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null,
        lastSeenAt: lastHeartbeatAt?.toISOString() ?? s?.createdAt?.toISOString() ?? null,
        unknownReason: computeUnknownReason({
          health,
          lastHeartbeatAt,
          hasSnapshot: Boolean(s),
          online,
        }),
        openTickets: tc.open,
        openSystemTickets: tc.system,
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

function clientMeta(
  c: SupportRow,
  rel?: {
    score: number
    shape: string
    label: string
    mttrHours: number | null
    csatAverage: number | null
  }
): FleetNode['meta'] {
  return {
    property: c.property,
    appVersion: c.appVersion,
    platform: c.platform,
    online: c.online,
    queueDepth: c.queueDepth,
    errorCount: c.errorCount,
    lastSeenAt: ago(c.lastSeenAt),
    lastHeartbeatAt: ago(c.lastHeartbeatAt),
    unknownReason: c.unknownReason,
    openTickets: c.openTickets,
    openSystemTickets: c.openSystemTickets,
    source: 'support',
    clientKey: c.clientKey,
    clientHealthLabel: c.health,
    reliabilityScore: rel?.score ?? null,
    reliabilityShape: rel?.shape ?? null,
    reliabilityLabel: rel?.label ?? null,
    reliabilityMttrHours: rel?.mttrHours ?? null,
    reliabilityCsat: rel?.csatAverage ?? null,
  }
}

function buildConfigDebt(hasRenderKey: boolean, renderOk: boolean, productNexusOk: boolean): FleetConfigDebtItem[] {
  const items: FleetConfigDebtItem[] = []
  if (!hasRenderKey) {
    items.push({
      panel: 'Fleet Nexus · Render services',
      reason: 'RENDER_API_KEY not set — Fleet scope shows Support clients only (no deploy blast radius)',
      envVars: ['RENDER_API_KEY', 'RENDER_SERVICE_ID'],
    })
  } else if (!renderOk) {
    items.push({
      panel: 'Fleet Nexus · Render services',
      reason: 'RENDER_API_KEY set but API returned 0 services — verify key scope or account',
      envVars: ['RENDER_API_KEY'],
    })
  }
  if (!process.env.RENDER_SERVICE_ID?.trim()) {
    items.push({
      panel: 'Fleet Nexus · Deployment scope',
      reason: 'RENDER_SERVICE_ID unset — Deployment lens cannot pick primary web service',
      envVars: ['RENDER_SERVICE_ID'],
    })
  }
  if (!productNexusOk) {
    items.push({
      panel: 'Fleet Nexus · Product topology',
      reason:
        'No product nexus snapshots — product must POST /api/relay/nexus-snapshot (see docs/OPEN_OPS_CHECKLIST.md § Fleet Nexus)',
      envVars: ['SUPPORT_INGEST_SECRET'],
    })
  }
  return items
}

function ensurePlatformNode(nodes: FleetNode[], edges: FleetEdge[]): { id: string } {
  const existing = nodes.find((n) => n.kind === 'platform')
  if (existing) return { id: existing.id }
  const id = 'platform/company-os'
  nodes.push({
    id,
    label: 'Company OS',
    kind: 'platform',
    health: 'ok',
    weight: 55,
    version: null,
    instances: 1,
    errPct: 0,
    p95: 0,
    cpu: 0,
    mem: 0,
    meta: {
      source: 'derived',
      note: 'Support relay hub — Render services appear here when RENDER_API_KEY is set',
    },
    deps: [],
    dependents: [],
    reach: [],
  })
  return { id }
}

function ensureHelpDeskNode(
  nodes: FleetNode[],
  edges: FleetEdge[],
  clients: SupportRow[],
  platformId: string
): string | null {
  const totalOpen = clients.reduce((s, c) => s + c.openTickets, 0)
  const systemOpen = clients.reduce((s, c) => s + c.openSystemTickets, 0)
  if (totalOpen === 0) return null
  const id = 'ops/help-desk'
  const health: FleetHealth = systemOpen > 0 ? 'warn' : totalOpen > 5 ? 'warn' : 'ok'
  nodes.push({
    id,
    label: 'Help Desk',
    kind: 'infra',
    health,
    weight: 35 + Math.min(40, totalOpen * 3),
    version: null,
    instances: 1,
    errPct: systemOpen,
    p95: 0,
    cpu: 0,
    mem: 0,
    meta: {
      source: 'derived',
      openTickets: totalOpen,
      openSystemTickets: systemOpen,
      note: `${totalOpen} open ticket${totalOpen === 1 ? '' : 's'} · ${systemOpen} SYSTEM-scoped`,
    },
    deps: [],
    dependents: [],
    reach: [],
  })
  edges.push({ source: id, target: platformId, weight: 20 })
  for (const c of clients.filter((x) => x.openTickets > 0)) {
    edges.push({
      source: `support/${c.id}`,
      target: id,
      weight: 15 + Math.min(30, c.openTickets * 5),
    })
  }
  return id
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
  deployHistoryByService: Map<string, FleetDeployHistoryItem[]>,
  reliabilityByKey?: Map<
    string,
    {
      score: number
      shape: string
      label: string
      mttrHours: number | null
      csatAverage: number | null
    }
  >
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

  let companyNode = nodes.find((n) => n.kind === 'platform')

  for (const c of clients) {
    const id = `support/${c.id}`
    const parent = matchClientToService(c, services)
    const rel = reliabilityByKey?.get(c.clientKey)
    nodes.push({
      id,
      label: c.label,
      kind: 'client',
      health: clientHealthToFleet(c.health),
      weight: 20 + Math.min(80, c.queueDepth + c.errorCount * 5 + c.openTickets * 2),
      version: c.appVersion,
      instances: 1,
      errPct: c.errorCount + c.openSystemTickets,
      p95: 0,
      cpu: 0,
      mem: 0,
      meta: clientMeta(c, rel),
      deps: [],
      dependents: [],
      reach: [],
    })
    if (parent) {
      edges.push({ source: id, target: parent, weight: 30 + c.queueDepth })
    } else if (companyNode) {
      edges.push({ source: id, target: companyNode.id, weight: 15 })
    }
  }

  // Support-only blast radius when Render services are absent.
  if (services.length === 0 && clients.length > 0) {
    const platform = ensurePlatformNode(nodes, edges)
    companyNode = nodes.find((n) => n.id === platform.id)
    for (const c of clients) {
      const id = `support/${c.id}`
      if (!edges.some((e) => e.source === id)) {
        edges.push({ source: id, target: platform.id, weight: 20 })
      }
    }
    ensureHelpDeskNode(nodes, edges, clients, platform.id)
  }

  const title =
    services.length || clients.length
      ? `Fleet — ${services.length} Render service${services.length === 1 ? '' : 's'}, ${clients.length} support client${clients.length === 1 ? '' : 's'}`
      : 'Fleet — no live nodes yet'

  return finalizeGraph(nodes, edges, 'fleet', title, fleetVersion)
}

function buildChainGraph(
  clients: SupportRow[],
  reliabilityByKey?: Map<
    string,
    {
      score: number
      shape: string
      label: string
      mttrHours: number | null
      csatAverage: number | null
    }
  >,
  productSnapshots: StoredProductNexus[] = []
): FleetGraph {
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
      errPct: members.reduce((s, m) => s + m.errorCount + m.openSystemTickets, 0),
      p95: 0,
      cpu: 0,
      mem: 0,
      meta: {
        property,
        source: 'derived',
        entities: members.length,
        openTickets: members.reduce((s, m) => s + m.openTickets, 0),
      },
      deps: [],
      dependents: [],
      reach: [],
    })

    for (const c of members) {
      const id = `entity/${c.id}`
      const rel = reliabilityByKey?.get(c.clientKey)
      nodes.push({
        id,
        label: c.label,
        kind: 'entity',
        health: clientHealthToFleet(c.health),
        weight: 25 + Math.min(60, c.queueDepth),
        version: c.appVersion,
        instances: 1,
        errPct: c.errorCount + c.openSystemTickets,
        p95: 0,
        cpu: 0,
        mem: 0,
        meta: clientMeta(c, rel),
        deps: [],
        dependents: [],
        reach: [],
      })
      edges.push({ source: id, target: hqId, weight: 20 })
    }
  }

  // Enrich with product chain-deployment nodes when snapshots exist.
  for (const snap of productSnapshots) {
    const chainNodes = snap.payload.nodes.filter((n) => n.kind === 'chain-deployment')
    if (chainNodes.length === 0) continue
    const prefix = `product/${slug(snap.clientKey)}`
    const { nodes: pNodes, edges: pEdges } = productSnapshotToFleet(
      {
        ...snap,
        payload: { ...snap.payload, nodes: chainNodes },
      },
      prefix
    )
    nodes.push(...pNodes)
    edges.push(...pEdges)
    const client = clients.find((c) => c.clientKey === snap.clientKey)
    if (client) {
      const entityId = `entity/${client.id}`
      const root = pNodes[0]
      if (root) {
        edges.push({ source: entityId, target: root.id, weight: 25 })
      }
    }
  }

  const snapNote =
    productSnapshots.length > 0
      ? ` · ${productSnapshots.length} product snapshot${productSnapshots.length === 1 ? '' : 's'}`
      : ''

  return finalizeGraph(
    nodes,
    edges,
    'chain',
    `Chain — ${byProperty.size} propert${byProperty.size === 1 ? 'y' : 'ies'} · ${clients.length} client${clients.length === 1 ? '' : 's'}${snapNote}`,
    null
  )
}

function buildDeploymentGraph(
  services: RenderServiceWithDeploy[],
  clients: SupportRow[],
  productSnapshots: StoredProductNexus[] = []
): FleetGraph {
  const nodes: FleetNode[] = []
  const edges: FleetEdge[] = []

  const primaryId = process.env.RENDER_SERVICE_ID
  const primary =
    services.find((s) => s.id === primaryId) ??
    services.find((s) => isProductish(s)) ??
    services[0]

  const hasProduct = productSnapshots.length > 0

  if (!primary && clients.length === 0 && !hasProduct) {
    return finalizeGraph(
      nodes,
      edges,
      'deployment',
      'Deployment — no Render service, support clients, or product snapshot',
      null
    )
  }

  let rootId: string | null = null
  let fleetVersion: string | null = null
  let titleBase = 'Deployment'

  if (primary) {
    rootId = `render/${primary.id}`
    fleetVersion = primary.deploy.commitSha
    titleBase = primary.name
    nodes.push({
      id: rootId,
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
      },
      deps: [],
      dependents: [],
      reach: [],
    })
  } else if (hasProduct) {
    const snap = productSnapshots[0]
    const edgeNode = snap.payload.nodes.find((n) => n.kind === 'edge' || n.kind === 'service')
    if (edgeNode) {
      const prefix = `product/${slug(snap.clientKey)}`
      const { nodes: pNodes, edges: pEdges } = productSnapshotToFleet(snap, prefix)
      nodes.push(...pNodes)
      edges.push(...pEdges)
      rootId = `${prefix}/${edgeNode.id}`
      fleetVersion = snap.appVersion
      titleBase = `${edgeNode.label} (product snapshot)`
    }
  } else {
    const platform = ensurePlatformNode(nodes, edges)
    rootId = platform.id
    titleBase = 'Company OS (support-only)'
  }

  // Merge product internal topology (exclude chain-deployment — those live in Chain scope).
  for (const snap of productSnapshots) {
    const internal = snap.payload.nodes.filter((n) => n.kind !== 'chain-deployment')
    if (internal.length === 0) continue
    const prefix = `product/${slug(snap.clientKey)}`
    const filtered: StoredProductNexus = {
      ...snap,
      payload: { ...snap.payload, nodes: internal },
    }
    const { nodes: pNodes, edges: pEdges } = productSnapshotToFleet(filtered, prefix)
    for (const pn of pNodes) {
      if (!nodes.some((n) => n.id === pn.id)) nodes.push(pn)
    }
    for (const pe of pEdges) {
      if (!edges.some((e) => e.source === pe.source && e.target === pe.target)) {
        edges.push(pe)
      }
    }
    if (rootId) {
      const edgeNode = internal.find((n) => n.kind === 'edge' || n.kind === 'service')
      if (edgeNode) {
        const productRoot = `${prefix}/${edgeNode.id}`
        if (rootId !== productRoot && nodes.some((n) => n.id === productRoot)) {
          edges.push({ source: rootId, target: productRoot, weight: 30 })
        }
      }
    }
  }

  // Known external deps when Render primary exists but no product snapshot yet.
  if (primary && !hasProduct) {
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
        meta: {
          source: 'derived',
          note: 'Inferred dependency — POST /api/relay/nexus-snapshot for live product map',
        },
        deps: [],
        dependents: [],
        reach: [],
      })
      if (rootId) edges.push({ source: rootId, target: stub.id, weight: 20 })
    }
  }

  const linked = primary
    ? clients.filter((c) => matchClientToService(c, services) === rootId)
    : clients
  for (const c of (linked.length ? linked : clients).slice(0, 12)) {
    const id = `support/${c.id}`
    if (nodes.some((n) => n.id === id)) continue
    nodes.push({
      id,
      label: c.label,
      kind: 'client',
      health: clientHealthToFleet(c.health),
      weight: 25,
      version: c.appVersion,
      instances: 1,
      errPct: c.errorCount + c.openSystemTickets,
      p95: 0,
      cpu: 0,
      mem: 0,
      meta: clientMeta(c),
      deps: [],
      dependents: [],
      reach: [],
    })
    if (rootId) edges.push({ source: id, target: rootId, weight: 25 })
  }

  const partialNote = !hasProduct && primary ? ' · awaiting product nexus snapshot' : ''
  const liveNote = hasProduct ? ' · product topology' : ''

  return finalizeGraph(
    nodes,
    edges,
    'deployment',
    `Deployment — ${titleBase}${liveNote}${partialNote}`,
    fleetVersion
  )
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
    sources: { render: false, support: false, demo: true, productNexus: false },
    counts: {
      renderServices: 0,
      supportClients: 0,
      unhealthy: 0,
      supportRed: 0,
      supportAmber: 0,
      supportUnknown: 0,
      productNexusSnapshots: 0,
    },
    configDebt: [
      {
        panel: 'Fleet Nexus · Render services',
        reason: 'Demo mode — set RENDER_API_KEY on Render for live fleet graph',
        envVars: ['RENDER_API_KEY', 'RENDER_SERVICE_ID'],
      },
    ],
    graphs: { fleet, chain, deployment },
    generatedAt: new Date().toISOString(),
  }
}

export async function buildFleetNexusPayload(): Promise<FleetNexusPayload> {
  const hasRenderKey = Boolean(process.env.RENDER_API_KEY?.trim())
  const [services, clients, productSnapshots] = await Promise.all([
    hasRenderKey ? listRenderServicesWithDeploys() : Promise.resolve([]),
    loadSupportClients(),
    loadLatestProductNexusSnapshots(),
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
  const productNexusOk = productSnapshots.length > 0
  const configDebt = buildConfigDebt(hasRenderKey, renderOk, productNexusOk)

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
      sources: { render: false, support: false, demo: false, productNexus: false },
      counts: {
        renderServices: 0,
        supportClients: 0,
        unhealthy: 0,
        supportRed: 0,
        supportAmber: 0,
        supportUnknown: 0,
        productNexusSnapshots: 0,
      },
      configDebt,
      graphs: {
        fleet: empty('fleet', 'Fleet — empty'),
        chain: empty('chain', 'Chain — empty'),
        deployment: empty('deployment', 'Deployment — empty'),
      },
      generatedAt: new Date().toISOString(),
    }
  }

  const reliabilityByKey = supportOk
    ? await computePropertyReliabilityMap(clients.map((c) => c.clientKey))
    : new Map()

  const graphs: Record<FleetScope, FleetGraph> = {
    fleet: buildFleetGraph(services, clients, deployHistoryByService, reliabilityByKey),
    chain: buildChainGraph(clients, reliabilityByKey, productSnapshots),
    deployment: buildDeploymentGraph(services, clients, productSnapshots),
  }

  const supportRed = clients.filter((c) => c.health === 'RED').length
  const supportAmber = clients.filter((c) => c.health === 'AMBER').length
  const supportUnknown = clients.filter((c) => c.health === 'UNKNOWN').length
  const unhealthy =
    services.filter((s) => s.deploy.level === 'error' || s.deploy.level === 'warn').length +
    supportRed +
    supportAmber

  const mode: FleetDataMode =
    renderOk && supportOk && (productNexusOk || supportUnknown === 0) ? 'live' : 'partial'
  const parts: string[] = []
  if (renderOk) parts.push(`Render (${services.length} services)`)
  else if (hasRenderKey) parts.push('Render configured but returned 0 services')
  else parts.push('Render not configured')
  if (supportOk) {
    parts.push(
      `Support (${clients.length} clients · ${supportRed} RED · ${supportAmber} AMBER · ${supportUnknown} Unknown)`
    )
  } else parts.push('no Support clients yet')
  if (productNexusOk) parts.push(`${productSnapshots.length} product snapshot${productSnapshots.length === 1 ? '' : 's'}`)

  const banner =
    mode === 'live'
      ? `✓ LIVE — ${parts.join(' · ')}`
      : `⚠ PARTIAL — ${parts.join(' · ')}${productNexusOk ? '' : '. Paste RENDER_API_KEY or ingest product nexus snapshots for full Deployment map.'}`

  return {
    mode,
    banner,
    sources: { render: renderOk, support: supportOk, demo: false, productNexus: productNexusOk },
    counts: {
      renderServices: services.length,
      supportClients: clients.length,
      unhealthy,
      supportRed,
      supportAmber,
      supportUnknown,
      productNexusSnapshots: productSnapshots.length,
    },
    configDebt,
    graphs,
    generatedAt: new Date().toISOString(),
  }
}
