'use client'

import useSWR from 'swr'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'
import type { SupportAnalyticsSnapshot } from '@/lib/support-analytics'

async function fetcher(url: string): Promise<SupportAnalyticsSnapshot> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<SupportAnalyticsSnapshot>
  if (!body.success) throw new Error(body.error)
  return body.data
}

/** Support & reliability KPIs — shape + label, PII-free. */
export function SupportReliabilityPanel() {
  const { data, error, mutate, isLoading } = useSWR(
    '/api/dr-os/support-analytics',
    fetcher,
    { refreshInterval: 60_000 }
  )

  return (
    <section
      className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
      aria-label="Support and reliability"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
          Support &amp; reliability
        </h2>
        <button
          type="button"
          onClick={() => void mutate()}
          className="text-[10px] text-[#5a5a78] underline"
          aria-label="Refresh support analytics"
        >
          Refresh
        </button>
      </div>

      {isLoading && !data ? (
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-[#1a1a26]" aria-hidden />
      ) : null}

      {error ? (
        <p className="mt-3 text-xs text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error.message}{' '}
          <button type="button" className="text-[#D4AF37] underline" onClick={() => void mutate()}>
            Retry
          </button>
        </p>
      ) : null}

      {data ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {data.ticketsByGate.map((g) => (
              <StatusBadge
                key={g.gate}
                level={g.count > 10 ? 'warn' : g.count > 0 ? 'ok' : 'unknown'}
                label={`${g.shape} ${g.label}: ${g.count}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi
              title="MTTR proxy"
              value={
                data.mttrHoursProxy != null
                  ? `${data.mttrHoursProxy}h`
                  : '—'
              }
              sub={`${data.resolvedSampleSize} resolved (90d)`}
              shape="⏱"
            />
            <Kpi
              title="CI / deploy fails"
              value={String(
                data.ciDeployFailCounts.openSystemInfra +
                  data.ciDeployFailCounts.openSystemIntegration
              )}
              sub={`${data.ciDeployFailCounts.agentWorking} agent working`}
              shape="✕"
            />
            <Kpi
              title="Knight seats"
              value={`${data.knightSeatTotal - data.knightSeatDegraded}/${data.knightSeatTotal}`}
              sub={
                data.knightSeatDegraded > 0
                  ? `${data.knightSeatDegraded} degraded`
                  : 'All configured'
              }
              shape={data.knightSeatDegraded > 0 ? '▲' : '✓'}
            />
            <Kpi
              title="Canary / fleet"
              value={`${data.canaryVsFleet.canary} / ${data.canaryVsFleet.fleet}`}
              sub={`${data.deadLetterNotify} dead-letter notify`}
              shape="◎"
            />
          </div>

          {data.errorFingerprintsTop.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#5a5a78]">
                Top error fingerprints
              </p>
              <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-[11px] text-[#a0a0b8]">
                {data.errorFingerprintsTop.slice(0, 5).map((p) => (
                  <li key={p.fingerprint} className="font-mono">
                    <span aria-hidden>●</span> {p.fingerprint} · ×{p.hitCount} ·{' '}
                    {p.errorCategory} · {p.productLine}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function Kpi({
  title,
  value,
  sub,
  shape,
}: {
  title: string
  value: string
  sub: string
  shape: string
}) {
  return (
    <div className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] p-2">
      <p className="text-[10px] uppercase tracking-widest text-[#D4AF37]">{title}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
        <span aria-hidden>{shape} </span>
        {value}
      </p>
      <p className="text-[10px] text-[#5a5a78]">{sub}</p>
    </div>
  )
}
