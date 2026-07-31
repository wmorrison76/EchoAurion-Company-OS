import { z } from 'zod'
import { db } from '@/lib/db'
import type { FleetEdge, FleetHealth, FleetNode, FleetNodeKind } from '@/types/fleet-nexus'

const nodeKindSchema = z.enum([
  'edge',
  'service',
  'datastore',
  'external',
  'chain-deployment',
  'infra',
  'deployment',
])

const healthSchema = z.enum(['ok', 'warn', 'error', 'unknown'])

export const productNexusSnapshotSchema = z.object({
  clientKey: z.string().min(1).max(200),
  appVersion: z.string().max(50).optional(),
  generatedAt: z.string().datetime().optional(),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        label: z.string().min(1).max(200),
        kind: nodeKindSchema,
        health: healthSchema.optional(),
        deps: z.array(z.string().max(120)).max(32).optional(),
        meta: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
      })
    )
    .min(1)
    .max(64),
  edges: z
    .array(
      z.object({
        source: z.string().min(1).max(120),
        target: z.string().min(1).max(120),
        weight: z.number().min(1).max(100).optional(),
      })
    )
    .max(128)
    .optional(),
})

export type ProductNexusSnapshotInput = z.infer<typeof productNexusSnapshotSchema>

export interface StoredProductNexus {
  clientKey: string
  appVersion: string | null
  payload: ProductNexusSnapshotInput
  createdAt: Date
}

const KIND_MAP: Record<string, FleetNodeKind> = {
  edge: 'edge',
  service: 'service',
  datastore: 'datastore',
  external: 'external',
  'chain-deployment': 'chain-deployment',
  infra: 'infra',
  deployment: 'deployment',
}

/** Persist a validated product topology snapshot (relay ingest). */
export async function storeProductNexusSnapshot(input: ProductNexusSnapshotInput): Promise<string> {
  const row = await db.productNexusSnapshot.create({
    data: {
      clientKey: input.clientKey,
      appVersion: input.appVersion ?? null,
      payload: input,
    },
  })
  return row.id
}

/** Latest snapshot per clientKey (most recent first). */
export async function loadLatestProductNexusSnapshots(): Promise<StoredProductNexus[]> {
  try {
    const rows = await db.productNexusSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    const seen = new Set<string>()
    const out: StoredProductNexus[] = []
    for (const row of rows) {
      if (seen.has(row.clientKey)) continue
      seen.add(row.clientKey)
      const parsed = productNexusSnapshotSchema.safeParse(row.payload)
      if (!parsed.success) continue
      out.push({
        clientKey: row.clientKey,
        appVersion: row.appVersion,
        payload: parsed.data,
        createdAt: row.createdAt,
      })
    }
    return out
  } catch {
    return []
  }
}

function toFleetHealth(h?: string): FleetHealth {
  if (h === 'ok' || h === 'warn' || h === 'error' || h === 'unknown') return h
  return 'unknown'
}

/** Convert a stored product snapshot into Fleet nodes + edges (prefixed ids). */
export function productSnapshotToFleet(
  snap: StoredProductNexus,
  prefix: string
): { nodes: FleetNode[]; edges: FleetEdge[] } {
  const nodes: FleetNode[] = snap.payload.nodes.map((n) => ({
    id: `${prefix}/${n.id}`,
    label: n.label,
    kind: KIND_MAP[n.kind] ?? 'service',
    health: toFleetHealth(n.health),
    weight: 40,
    version: snap.appVersion,
    instances: 1,
    errPct: 0,
    p95: 0,
    cpu: 0,
    mem: 0,
    meta: {
      source: 'derived',
      clientKey: snap.clientKey,
      productNodeId: n.id,
      snapshotAt: snap.createdAt.toISOString(),
      ...(n.meta ?? {}),
    },
    deps: [],
    dependents: [],
    reach: [],
  }))

  const edges: FleetEdge[] = []
  const idSet = new Set(nodes.map((n) => n.id))

  for (const n of snap.payload.nodes) {
    const srcId = `${prefix}/${n.id}`
    for (const dep of n.deps ?? []) {
      const tgtId = `${prefix}/${dep}`
      if (idSet.has(srcId) && idSet.has(tgtId)) {
        edges.push({ source: srcId, target: tgtId, weight: 25 })
      }
    }
  }

  for (const e of snap.payload.edges ?? []) {
    const srcId = `${prefix}/${e.source}`
    const tgtId = `${prefix}/${e.target}`
    if (idSet.has(srcId) && idSet.has(tgtId)) {
      edges.push({ source: srcId, target: tgtId, weight: e.weight ?? 20 })
    }
  }

  return { nodes, edges }
}
