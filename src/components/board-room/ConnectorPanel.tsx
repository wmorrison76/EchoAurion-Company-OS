'use client'

import useSWR from 'swr'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'
import type { ConnectorState } from '@/types/board-room'

async function fetcher(url: string): Promise<ConnectorState[]> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<ConnectorState[]>
  if (!body.success) throw new Error(body.error)
  return body.data
}

function scope(c: ConnectorState): string {
  if (c.conductor) return 'Conductor'
  if (c.hasDbAccess) return 'Live DB'
  return 'Context only'
}

// Phase 3 — connector-state dashboard. Shows which seats are wired and their
// data scope. Key values are never exposed — only presence (configured).
export function ConnectorPanel() {
  const { data, error } = useSWR('/api/board-room/connectors', fetcher, {
    revalidateOnFocus: false,
  })

  const activeCount = data?.filter((c) => c.configured).length ?? 0

  return (
    <KPICard
      title="Connectors"
      badge={
        data ? (
          <StatusBadge
            level={activeCount === data.length ? 'ok' : activeCount > 0 ? 'warn' : 'unknown'}
            label={`${activeCount}/${data.length} active`}
          />
        ) : undefined
      }
    >
      {error ? (
        <p className="text-sm text-[#a0a0b8]">
          <span aria-hidden="true">✕</span> Connector state unavailable
        </p>
      ) : !data ? (
        <p className="text-sm text-[#a0a0b8]">Loading connectors…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-[#D4AF37]">
                <th className="py-2 pr-4 font-medium">Seat</th>
                <th className="py-2 pr-4 font-medium">Provider</th>
                <th className="py-2 pr-4 font-medium">Key</th>
                <th className="py-2 pr-4 font-medium">Scope</th>
                <th className="py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c, i) => (
                <tr key={c.seat} className={i % 2 === 0 ? 'bg-[#12121a]' : 'bg-[#0a0a0f]'}>
                  <td className="py-2 pr-4 text-white">{c.name}</td>
                  <td className="py-2 pr-4 text-[#a0a0b8]">{c.provider}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-[#5a5a78]">
                    {c.configured ? c.apiKeyEnv : c.hint ?? c.apiKeyEnv}
                  </td>
                  <td className="py-2 pr-4 text-[#a0a0b8]">{scope(c)}</td>
                  <td className="py-2 text-right">
                    <StatusBadge
                      level={c.configured ? 'ok' : 'unknown'}
                      label={c.configured ? 'Active' : 'Unavailable'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </KPICard>
  )
}
