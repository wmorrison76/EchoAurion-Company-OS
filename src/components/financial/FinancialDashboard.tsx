'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { isUnauthorized } from '@/lib/fetchers'
import { formatUSD } from '@/lib/utils'
import type { APIResponse } from '@/types'
import type { FinancialOverview } from '@/types/financial'
import { BalanceCards } from './BalanceCards'
import { BurnRateChart } from './BurnRateChart'
import { RunwayCountdown } from './RunwayCountdown'
import { BillCalendar } from './BillCalendar'
import { BrexPanel } from './BrexPanel'
import { PLSummary } from './PLSummary'
import { PlaidLinkButton } from './PlaidLinkButton'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { KPICard } from '@/components/ui/KPICard'

async function overviewFetcher(url: string): Promise<FinancialOverview> {
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 401) {
    const err = new Error('Unauthorized')
    err.name = 'UnauthorizedError'
    throw err
  }
  const body = (await res.json()) as APIResponse<FinancialOverview>
  if (!body.success) throw new Error(body.error)
  return body.data
}

export function FinancialDashboard() {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR('/api/financial/overview', overviewFetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  useEffect(() => {
    if (error?.name === 'UnauthorizedError' || isUnauthorized(error)) router.replace('/login')
  }, [error, router])

  if (isLoading || (!data && !error)) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (error && error.name !== 'UnauthorizedError') {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-[#ef4444] bg-[#1a1a26] px-4 py-3 text-sm text-white"
      >
        <span aria-hidden="true">✕</span>
        <span>Connection error: {error instanceof Error ? error.message : 'Unavailable'}</span>
        <button
          type="button"
          onClick={() => mutate()}
          className="ml-auto text-xs text-[#D4AF37] underline"
          aria-label="Retry loading financial data"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  if (!data.connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] px-6 py-16 text-center">
        <h2 className="text-lg font-semibold text-white">No accounts connected</h2>
        <p className="max-w-md text-sm text-[#a0a0b8]">
          Link Wells Fargo personal, Wells Fargo business, and Brex via Plaid to see balances,
          burn rate, and runway. Brex activity also syncs through its API — use the Brex panel to sync on demand.
        </p>
        <PlaidLinkButton onConnected={() => mutate()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <BalanceCards balances={data.balances} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <RunwayCountdown runway={data.runway} />
        <BurnRateChart burn={data.burnRate} />
        <BrexPanel />
        <BillCalendar bills={data.bills} rentSplitMonthlyTotal={data.rentSplitMonthlyTotal} />
        <PLSummary pl={data.pl} />

        <KPICard title="Recent Transactions" className="sm:col-span-2 xl:col-span-3">
          {data.recentTransactions.length === 0 ? (
            <p className="text-sm text-[#a0a0b8]">No transactions yet</p>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-[#2a2a3f]">
              {data.recentTransactions.map((t, i) => (
                <li
                  key={t.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                    i % 2 === 0 ? 'bg-[#12121a]' : 'bg-[#0a0a0f]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-white">
                      {t.merchantName ?? t.name}
                      {t.pending ? (
                        <span className="ml-2 text-[11px] text-[#f59e0b]">⚠ pending</span>
                      ) : null}
                      {t.rentSplit ? (
                        <span className="ml-2 text-[11px] text-[#D4AF37]">▲ Rent split</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-[#5a5a78]">
                      {t.accountName} · {formatDistanceToNow(new Date(t.date), { addSuffix: true })}
                    </p>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-white">
                    {t.amount > 0 ? '−' : '+'}
                    {formatUSD(Math.abs(t.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </KPICard>
      </div>

      <p className="text-right text-xs text-[#5a5a78]">
        Updated {formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })}
      </p>
    </div>
  )
}
