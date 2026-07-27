'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { isUnauthorized } from '@/lib/fetchers'
import { KanbanColumn } from './KanbanColumn'
import { ContactCard } from './ContactCard'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { DEAL_STAGES, DEAL_STAGE_LABEL } from '@/types/crm'
import type { APIResponse } from '@/types'
import type { BoardCard, DealStage } from '@/types/crm'

async function fetcher(url: string): Promise<BoardCard[]> {
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 401) {
    const err = new Error('Unauthorized')
    err.name = 'UnauthorizedError'
    throw err
  }
  const body = (await res.json()) as APIResponse<BoardCard[]>
  if (!body.success) throw new Error(body.error)
  return body.data
}

export function KanbanBoard({ tagFilter }: { tagFilter?: string }) {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR('/api/crm/deals', fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  useEffect(() => {
    if (error?.name === 'UnauthorizedError' || isUnauthorized(error)) router.replace('/login')
  }, [error, router])

  const cards = useMemo(() => {
    if (!data) return []
    return tagFilter ? data.filter((c) => c.tags.includes(tagFilter)) : data
  }, [data, tagFilter])

  const move = useCallback(
    async (dealId: string, stage: DealStage) => {
      // Optimistic update (§13.2).
      mutate(
        (prev) => prev?.map((c) => (c.dealId === dealId ? { ...c, stage } : c)),
        { revalidate: false }
      )
      try {
        const res = await fetch(`/api/crm/deals/${dealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage }),
        })
        const body = (await res.json()) as APIResponse<unknown>
        if (!body.success) throw new Error(body.error)
      } catch {
        mutate() // revert to server state on failure
      }
    },
    [mutate]
  )

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
          aria-label="Retry loading CRM board"
        >
          Retry
        </button>
      </div>
    )
  }

  const byStage = (stage: DealStage) => cards.filter((c) => c.stage === stage)

  return (
    <div className="flex flex-col gap-2">
      {tagFilter ? (
        <p className="text-xs text-[#a0a0b8]">
          Filtered by tag: <span className="text-[#D4AF37]">{tagFilter}</span> ·{' '}
          <a href="/crm" className="underline">
            clear
          </a>
        </p>
      ) : null}

      {/* Desktop kanban (md+): horizontal columns. */}
      <div className="hidden gap-4 overflow-x-auto pb-4 md:flex">
        {DEAL_STAGES.map((stage) => (
          <KanbanColumn key={stage} stage={stage} cards={byStage(stage)} onMove={move} />
        ))}
      </div>

      {/* Mobile (<768px): stacked list by stage — no horizontal scroll (§13.2). */}
      <div className="flex flex-col gap-5 md:hidden">
        {DEAL_STAGES.map((stage) => {
          const stageCards = byStage(stage)
          if (stageCards.length === 0) return null
          return (
            <section key={stage} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-widest text-[#D4AF37]">
                  {DEAL_STAGE_LABEL[stage]}
                </h3>
                <span className="font-mono text-xs tabular-nums text-[#5a5a78]">
                  {stageCards.length}
                </span>
              </div>
              {stageCards.map((card) => (
                <ContactCard key={card.dealId} card={card} onMove={move} />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
