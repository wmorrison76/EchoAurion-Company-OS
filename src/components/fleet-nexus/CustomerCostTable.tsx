'use client'

import useSWR from 'swr'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'

type CostRow = {
  clientKey: string
  label: string | null
  estimatedUsd: number
  workSpendUsd: number
  callCount: number
  tokenEstimate: number
  shape: string
  labelStatus: string
  estimatedUsdLabel: string
  workSpendUsdLabel: string
  totalUsdLabel: string
}

async function fetcher(url: string): Promise<{ rows: CostRow[] }> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<{ rows: CostRow[] }>
  if (!body.success) throw new Error(body.error)
  return body.data
}

/** Enterprise / Fleet — AI & seat cost by customer (shape+label). */
export function CustomerCostTable() {
  const { data, error, mutate, isLoading } = useSWR(
    '/api/fleet-nexus/customer-costs?days=30',
    fetcher,
    { refreshInterval: 120_000 }
  )

  return (
    <section
      className="mt-6 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4"
      aria-label="Cost by customer"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
          Cost by customer
        </h2>
        <button
          type="button"
          onClick={() => void mutate()}
          className="text-[10px] text-[#5a5a78] underline"
          aria-label="Refresh customer costs"
        >
          Refresh
        </button>
      </div>
      <p className="mt-1 text-[11px] text-[#5a5a78]">
        Heuristic Knights/LLM + authorized work spend · no guest PII · see docs/CUSTOMER_AI_COST.md
      </p>

      {isLoading && !data ? (
        <div className="mt-3 h-16 animate-pulse rounded bg-[#1a1a26]" aria-hidden />
      ) : null}
      {error ? (
        <p className="mt-3 text-xs text-[#a0a0b8]">
          <span aria-label="Error">✕</span> {error.message}
        </p>
      ) : null}

      {data && data.rows.length === 0 ? (
        <p className="mt-3 text-xs text-[#5a5a78]">No SupportClient rows yet.</p>
      ) : null}

      {data && data.rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-[#D4AF37]">
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Client</th>
                <th className="py-2 pr-2">AI est.</th>
                <th className="py-2 pr-2">Work</th>
                <th className="py-2 pr-2">Total</th>
                <th className="py-2">Calls</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 20).map((r, i) => (
                <tr
                  key={r.clientKey}
                  className={i % 2 === 0 ? 'bg-[#0a0a0f]' : 'bg-[#12121a]'}
                >
                  <td className="py-2 pr-2">
                    <StatusBadge
                      level={
                        r.labelStatus === 'High spend'
                          ? 'error'
                          : r.labelStatus === 'Active'
                            ? 'warn'
                            : r.labelStatus === 'Low'
                              ? 'ok'
                              : 'unknown'
                      }
                      label={`${r.shape} ${r.labelStatus}`}
                    />
                  </td>
                  <td className="py-2 pr-2 font-mono text-[11px] text-white">
                    {r.label ?? r.clientKey}
                  </td>
                  <td className="py-2 pr-2 font-mono tabular-nums text-[#a0a0b8]">
                    {r.estimatedUsdLabel}
                  </td>
                  <td className="py-2 pr-2 font-mono tabular-nums text-[#a0a0b8]">
                    {r.workSpendUsdLabel}
                  </td>
                  <td className="py-2 pr-2 font-mono tabular-nums text-white">
                    {r.totalUsdLabel}
                  </td>
                  <td className="py-2 font-mono tabular-nums text-[#5a5a78]">
                    {r.callCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
