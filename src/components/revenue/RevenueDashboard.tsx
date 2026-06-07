'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { isUnauthorized } from '@/lib/fetchers'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { MRRChart } from './MRRChart'
import { SalaryTargetBar } from './SalaryTargetBar'
import { RaiseTracker } from './RaiseTracker'
import { RunwayCalculator } from './RunwayCalculator'
import { CustomerPipeline } from './CustomerPipeline'
import type { APIResponse } from '@/types'
import type { RevenueOverview } from '@/types/revenue'

async function fetcher(url: string): Promise<RevenueOverview> {
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 401) {
    const err = new Error('Unauthorized')
    err.name = 'UnauthorizedError'
    throw err
  }
  const body = (await res.json()) as APIResponse<RevenueOverview>
  if (!body.success) throw new Error(body.error)
  return body.data
}

export function RevenueDashboard() {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR('/api/revenue/overview', fetcher, {
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
          aria-label="Retry loading revenue data"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MRRChart
          mrr={data.mrr}
          customerCount={data.customerCount}
          configured={data.mrrConfigured}
          error={data.mrrError}
          history={data.history}
        />
        <RunwayCalculator runway={data.runway} />
        <SalaryTargetBar salary={data.salary} />
        <RaiseTracker raise={data.raise} />
        <CustomerPipeline pipeline={data.pipeline} />
      </div>
      <p className="text-right text-xs text-[#5a5a78]">
        Updated {formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })}
      </p>
    </div>
  )
}
