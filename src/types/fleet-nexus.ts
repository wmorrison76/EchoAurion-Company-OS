import type { StatusLevel } from '@/types'

/** Fleet Nexus scopes — mapped to real data availability. */
export type FleetScope = 'fleet' | 'chain' | 'deployment'

/** Lenses for coloring / highlighting nodes. */
export type FleetLens = 'health' | 'bottle' | 'drift'

export type FleetNodeKind =
  | 'platform'
  | 'deployment'
  | 'chain-deployment'
  | 'hq'
  | 'entity'
  | 'client'
  | 'edge'
  | 'service'
  | 'infra'
  | 'datastore'
  | 'external'

export type FleetHealth = 'ok' | 'warn' | 'error' | 'unknown'

export interface FleetDeployHistoryItem {
  id: string
  label: string
  level: FleetHealth
  triggeredAt: string
  ago: string | null
  commitSha: string | null
  commitMessage: string | null
  durationSeconds: number | null
}

export interface FleetNodeMeta {
  region?: string
  serviceType?: string
  suspended?: boolean
  url?: string
  lastDeploy?: string | null
  deployStatus?: string | null
  property?: string | null
  appVersion?: string | null
  platform?: string | null
  online?: boolean
  queueDepth?: number
  errorCount?: number
  lastSeenAt?: string | null
  /** Support client health as text label (GREEN / AMBER / RED / UNKNOWN). */
  clientHealthLabel?: string | null
  /** Property reliability composite 0–100 (shape+label in UI). */
  reliabilityScore?: number | null
  reliabilityShape?: string | null
  reliabilityLabel?: string | null
  reliabilityMttrHours?: number | null
  reliabilityCsat?: number | null
  source?: 'render' | 'support' | 'demo' | 'derived'
  deployHistory?: FleetDeployHistoryItem[]
  [key: string]: string | number | boolean | null | undefined | FleetDeployHistoryItem[]
}

export interface FleetNode {
  id: string
  label: string
  kind: FleetNodeKind
  health: FleetHealth
  /** Proxy for node size — Render has no RPS; use instances or queue/error weight. */
  weight: number
  version: string | null
  instances: number
  /** Soft metrics when available (support diagnostics); otherwise 0 / unknown. */
  errPct: number
  p95: number
  cpu: number
  mem: number
  meta: FleetNodeMeta
  deps: string[]
  dependents: string[]
  reach: string[]
}

export interface FleetEdge {
  source: string
  target: string
  weight: number
}

export interface FleetGraph {
  scope: FleetScope
  title: string
  fleetVersion: string | null
  nodes: FleetNode[]
  edges: FleetEdge[]
}

export type FleetDataMode = 'live' | 'partial' | 'empty' | 'demo'

export interface FleetNexusPayload {
  mode: FleetDataMode
  banner: string
  sources: {
    render: boolean
    support: boolean
    demo: boolean
  }
  counts: {
    renderServices: number
    supportClients: number
    unhealthy: number
    /** Support clients with RED health (shape+label in UI). */
    supportRed: number
    /** Support clients with AMBER health. */
    supportAmber: number
  }
  graphs: Record<FleetScope, FleetGraph>
  generatedAt: string
}

export function healthToStatus(h: FleetHealth): StatusLevel {
  return h
}
