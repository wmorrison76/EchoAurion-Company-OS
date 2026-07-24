'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatUSD } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import type { APIResponse } from '@/types'

interface BrexTxn {
  id: string
  merchantName: string | null
  description: string | null
  amount: number
  postedAt: string
  category: string | null
}

interface BrexSummary {
  lastSyncedAt: string | null
  recent30dSpend: number
  transactions: BrexTxn[]
}

async function fetcher(url: string): Promise<BrexSummary> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<BrexSummary>
  if (!body.success) throw new Error(body.error)
  return body.data
}

export function BrexPanel(): JSX.Element {
  const { data, error, isLoading, mutate } = useSWR<BrexSummary>(
    '/api/financial/brex/summary',
    fetcher,
    { refreshInterval: 60_000 }
  )
  const [syncing, setSyncing] = useState(false)

  async function handleSync(): Promise<void> {
    setSyncing(true)
    try {
      await fetch('/api/financial/brex/sync', { method: 'POST' })
      await mutate()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <KPICard title="Brex" className="sm:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-[#5a5a78]">Last 30 days on card</p>
          <p className="mt-1 font-mono text-2xl tabular-nums text-white">
            {isLoading ? '—' : data ? formatUSD(data.recent30dSpend) : '—'}
          </p>
          <p className="mt-1 text-xs text-[#a0a0b8]">
            {data?.lastSyncedAt
              ? `Synced ${formatDistanceToNow(new Date(data.lastSyncedAt), { addSuffix: true })}`
              : 'Not yet synced'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="rounded border border-[#2a2a3f] bg-[#0f0f1f] px-3 py-1.5 text-xs text-white hover:bg-[#1a1a2f] disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Sync Brex'}
        </button>
      </div>

      {error ? (
        <div className="mt-3">
          <StatusBadge level="error" label="Brex sync error" />
          <p className="mt-1 text-xs text-[#a0a0b8]">{error.message}</p>
        </div>
      ) : null}

      {data && data.transactions.length > 0 ? (
        <ul className="mt-3 flex flex-col divide-y divide-[#2a2a3f]">
          {data.transactions.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="truncate text-white">
                {t.merchantName ?? t.description ?? 'Unlabeled charge'}
              </span>
              <span className="font-mono tabular-nums text-[#D4AF37]">
                {formatUSD(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[#a0a0b8]">
          No card activity yet. Click Sync Brex once the migration completes.
        </p>
      )}
    </KPICard>
  )
}
