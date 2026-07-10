'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { FleetGraphCanvas, HC, isBottleneck } from '@/components/fleet-nexus/FleetGraphCanvas'
import { isUnauthorized } from '@/lib/fetchers'
import type { APIResponse } from '@/types'
import type {
  FleetHealth,
  FleetLens,
  FleetNexusPayload,
  FleetNode,
  FleetScope,
} from '@/types/fleet-nexus'

const HEALTH_LABEL: Record<FleetHealth, string> = {
  ok: 'Healthy',
  warn: 'Warning',
  error: 'Error',
  unknown: 'Unknown',
}

async function fetcher(url: string): Promise<FleetNexusPayload> {
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 401) {
    const err = new Error('Unauthorized')
    err.name = 'UnauthorizedError'
    throw err
  }
  const body = (await res.json()) as APIResponse<FleetNexusPayload>
  if (!body.success) throw new Error(body.error)
  return body.data
}

const SCOPES: { value: FleetScope; label: string }[] = [
  { value: 'fleet', label: 'Fleet' },
  { value: 'chain', label: 'Chain' },
  { value: 'deployment', label: 'Deployment' },
]

const LENSES: { value: FleetLens; label: string }[] = [
  { value: 'health', label: 'Health' },
  { value: 'bottle', label: 'Bottlenecks' },
  { value: 'drift', label: 'Version drift' },
]

function modeBadge(mode: FleetNexusPayload['mode']): { level: FleetHealth; label: string } {
  if (mode === 'live') return { level: 'ok', label: 'Live' }
  if (mode === 'partial') return { level: 'warn', label: 'Partial' }
  if (mode === 'demo') return { level: 'warn', label: 'Demo' }
  return { level: 'unknown', label: 'Empty' }
}

export function FleetNexusViewer() {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR('/api/fleet-nexus/graph', fetcher, {
    refreshInterval: 60_000,
    shouldRetryOnError: false,
  })
  const [scope, setScope] = useState<FleetScope>('fleet')
  const [lens, setLens] = useState<FleetLens>('health')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (error?.name === 'UnauthorizedError' || isUnauthorized(error)) router.replace('/login')
  }, [error, router])

  const graph = data?.graphs[scope]
  const byId = useMemo(() => {
    const m = new Map<string, FleetNode>()
    if (graph) for (const n of graph.nodes) m.set(n.id, n)
    return m
  }, [graph])

  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const affected = useMemo(() => new Set(selected?.dependents ?? []), [selected])

  function select(id: string | null) {
    setSelectedId(id)
  }

  if (error && error.name !== 'UnauthorizedError' && !isUnauthorized(error)) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-6 text-sm text-[#a0a0b8]">
        <span aria-label="Error">✕</span>
        <span>Error: {error.message}</span>
        <button
          type="button"
          onClick={() => mutate()}
          className="text-xs text-[#D4AF37] underline"
          aria-label="Retry loading Fleet Nexus"
        >
          Retry
        </button>
      </div>
    )
  }

  if (isLoading || !data || !graph) {
    return (
      <div className="grid min-h-[60vh] grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-h-[420px] animate-pulse rounded-xl bg-[#12121a]" />
        <div className="h-48 animate-pulse rounded-xl bg-[#12121a]" />
      </div>
    )
  }

  const mb = modeBadge(data.mode)

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-col gap-3 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge level={mb.level} label={mb.label} />
          <StatusBadge
            level={data.counts.unhealthy > 0 ? 'warn' : 'ok'}
            label="Attention"
            count={data.counts.unhealthy}
          />
          <span className="font-mono text-xs tabular-nums text-[#a0a0b8]">
            {data.counts.renderServices} svc · {data.counts.supportClients} clients
          </span>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
          <label className="flex items-center gap-2 text-xs text-[#a0a0b8]">
            <span>Scope</span>
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as FleetScope)
                setSelectedId(null)
              }}
              aria-label="Fleet Nexus scope"
              className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-2 py-1.5 text-sm text-white"
            >
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Health lens">
            {LENSES.map((l) => (
              <button
                key={l.value}
                type="button"
                aria-label={`${l.label} lens`}
                aria-pressed={lens === l.value}
                onClick={() => {
                  setLens(l.value)
                  setSelectedId(null)
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors duration-150 ${
                  lens === l.value
                    ? 'border-[#D4AF37] bg-[#1a1a26] text-[#D4AF37]'
                    : 'border-[#2a2a3f] text-[#a0a0b8] hover:border-[#D4AF37] hover:text-[#D4AF37]'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Reset selection and fit graph"
            onClick={() => setSelectedId(null)}
            className="rounded-lg border border-[#2a2a3f] px-2.5 py-1.5 text-xs text-[#a0a0b8] transition-colors duration-150 hover:border-[#D4AF37] hover:text-[#D4AF37]"
          >
            Reset
          </button>
          <button
            type="button"
            aria-label="Refresh fleet data"
            onClick={() => mutate()}
            className="rounded-lg border border-[#2a2a3f] px-2.5 py-1.5 text-xs text-[#a0a0b8] transition-colors duration-150 hover:border-[#D4AF37] hover:text-[#D4AF37]"
          >
            Refresh
          </button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-[#a0a0b8]">{data.banner}</p>
      <p className="text-xs text-[#5a5a78]">{graph.title}</p>

      <div className="grid min-h-[min(70vh,640px)] grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="relative min-h-[420px] overflow-hidden rounded-xl border border-[#2a2a3f]">
          {graph.nodes.length === 0 ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center">
              <StatusBadge level="unknown" label="Unknown" />
              <p className="max-w-sm text-sm text-[#a0a0b8]">
                No nodes in this scope. Configure <code className="text-[#D4AF37]">RENDER_API_KEY</code>{' '}
                or wait for Support diagnostics.
              </p>
            </div>
          ) : (
            <FleetGraphCanvas
              graph={graph}
              lens={lens}
              selectedId={selectedId}
              affected={affected}
              onSelect={select}
            />
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f]/90 px-3 py-2 text-[11px] text-[#a0a0b8]">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                <span aria-hidden="true" className="mr-1 font-mono text-[#22c55e]">
                  ✓
                </span>
                Healthy
              </span>
              <span>
                <span aria-hidden="true" className="mr-1 font-mono text-[#f59e0b]">
                  ⚠
                </span>
                Warning
              </span>
              <span>
                <span aria-hidden="true" className="mr-1 font-mono text-[#ef4444]">
                  ✕
                </span>
                Error
              </span>
              <span>
                <span aria-hidden="true" className="mr-1 font-mono text-[#6b7280]">
                  ?
                </span>
                Unknown
              </span>
            </div>
            <p className="mt-1">Click a node for operational blast radius · drag to pan · scroll to zoom</p>
          </div>
        </div>

        <aside className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4">
          {!selected ? (
            <div className="text-sm text-[#a0a0b8]">
              <p className="mb-2 text-[#D4AF37]">Detail</p>
              <p>
                Pick a <strong className="text-white">scope</strong>, switch{' '}
                <strong className="text-white">lenses</strong>, and click any node to trace its{' '}
                <strong className="text-white">operational blast radius</strong> — what degrades if it
                does.
              </p>
              <p className="mt-3 text-xs text-[#5a5a78]">
                Fleet = Render services + Support clients · Chain = property groups · Deployment =
                primary service (partial without product snapshots).
              </p>
            </div>
          ) : (
            <DetailPanel node={selected} byId={byId} onSelect={select} />
          )}
        </aside>
      </div>
    </div>
  )
}

function DetailPanel({
  node,
  byId,
  onSelect,
}: {
  node: FleetNode
  byId: Map<string, FleetNode>
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-[#D4AF37]">{node.label}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge level={node.health} label={HEALTH_LABEL[node.health]} />
        <span className="rounded-full border border-[#2a2a3f] px-2 py-0.5 text-[10px] text-[#a0a0b8]">
          {node.kind}
        </span>
        {node.version ? (
          <span className="rounded-full border border-[#2a2a3f] px-2 py-0.5 font-mono text-[10px] text-[#a0a0b8]">
            {node.version}
          </span>
        ) : null}
      </div>

      <dl className="mt-3 divide-y divide-[#2a2a3f] text-sm">
        <Stat label="Instances" value={String(node.instances)} />
        {node.meta.region ? <Stat label="Region" value={String(node.meta.region)} /> : null}
        {node.meta.serviceType ? <Stat label="Type" value={String(node.meta.serviceType)} /> : null}
        {node.meta.deployStatus ? (
          <Stat label="Deploy" value={String(node.meta.deployStatus)} />
        ) : null}
        {node.meta.lastDeploy ? <Stat label="Last deploy" value={String(node.meta.lastDeploy)} /> : null}
        {node.meta.property ? <Stat label="Property" value={String(node.meta.property)} /> : null}
        {typeof node.meta.queueDepth === 'number' ? (
          <Stat label="Queue depth" value={String(node.meta.queueDepth)} />
        ) : null}
        {typeof node.meta.errorCount === 'number' ? (
          <Stat label="Errors" value={String(node.meta.errorCount)} />
        ) : null}
        {typeof node.meta.online === 'boolean' ? (
          <Stat label="Online" value={node.meta.online ? 'Yes' : 'No'} />
        ) : null}
        {node.meta.lastSeenAt ? <Stat label="Last seen" value={String(node.meta.lastSeenAt)} /> : null}
        {node.meta.source ? <Stat label="Source" value={String(node.meta.source)} /> : null}
        {node.meta.url ? (
          <Stat
            label="URL"
            value={
              <a
                href={String(node.meta.url)}
                target="_blank"
                rel="noreferrer"
                className="text-[#D4AF37] underline"
                aria-label={`Open ${node.label} URL`}
              >
                {String(node.meta.url)}
              </a>
            }
          />
        ) : null}
        {node.meta.note ? (
          <div className="py-2 text-xs text-[#5a5a78]">{String(node.meta.note)}</div>
        ) : null}
      </dl>

      {isBottleneck(node) ? (
        <div className="mt-3">
          <StatusBadge level="error" label="Bottleneck" />
        </div>
      ) : null}

      {node.dependents.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-[11px] uppercase tracking-widest text-[#5a5a78]">
            Blast radius — {node.dependents.length} affected
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {node.dependents.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                aria-label={`Select ${byId.get(id)?.label ?? id}`}
                className="rounded border border-[#ef4444]/50 bg-[#1a1a26] px-2 py-0.5 text-[11px] text-[#fca5a5] transition-colors duration-150 hover:border-[#ef4444]"
              >
                {byId.get(id)?.label ?? id}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-[#5a5a78]">Nothing depends on this — a leaf node.</p>
      )}

      {node.reach.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-[11px] uppercase tracking-widest text-[#5a5a78]">
            Depends on ({node.reach.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {node.reach.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                aria-label={`Select dependency ${byId.get(id)?.label ?? id}`}
                className="rounded border border-[#2a2a3f] bg-[#0a0a0f] px-2 py-0.5 text-[11px] text-[#a0a0b8] transition-colors duration-150 hover:border-[#D4AF37]"
              >
                {byId.get(id)?.label ?? id}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Keep HC referenced for potential future inline dots — colorblind uses StatusBadge */}
      <span className="sr-only" style={{ color: HC[node.health] }}>
        {HEALTH_LABEL[node.health]}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-[#a0a0b8]">{label}</dt>
      <dd className="text-right font-mono text-xs tabular-nums text-white">{value}</dd>
    </div>
  )
}
