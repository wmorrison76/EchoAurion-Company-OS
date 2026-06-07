'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { KPICard } from '@/components/ui/KPICard'
import type { APIResponse } from '@/types'
import type { BriefingDTO } from '@/types/board-room'

async function fetcher(url: string): Promise<BriefingDTO | null> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<BriefingDTO | null>
  if (!body.success) throw new Error(body.error)
  return body.data
}

export function BriefingCard() {
  const { data, mutate } = useSWR('/api/board-room/briefing', fetcher, { revalidateOnFocus: false })
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      await fetch('/api/board-room/briefing', { method: 'POST' })
      await mutate()
    } finally {
      setBusy(false)
    }
  }, [mutate])

  return (
    <KPICard
      title="Daily Briefing"
      badge={
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="rounded-lg border border-[#2a2a3f] px-3 py-1 text-xs text-[#a0a0b8] transition-colors duration-150 hover:bg-[#1a1a26] disabled:opacity-50"
          aria-label="Generate today's briefing"
        >
          {busy ? 'Generating…' : 'Refresh'}
        </button>
      }
    >
      {data ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-white">{data.headline}</p>
          <p className="text-xs text-[#5a5a78]">
            {formatDistanceToNow(new Date(data.createdAt), { addSuffix: true })} · auto-runs 7am via
            cron
          </p>
        </div>
      ) : (
        <p className="text-sm text-[#a0a0b8]">
          No briefing yet — the 7am cron will post one, or refresh now.
        </p>
      )}
    </KPICard>
  )
}
