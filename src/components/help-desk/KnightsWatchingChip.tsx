'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'
import type { KnightsWatchSnapshot } from '@/types/knights-watch'

async function fetcher(url: string): Promise<KnightsWatchSnapshot> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<KnightsWatchSnapshot>
  if (!body.success) throw new Error(body.error)
  return body.data
}

/**
 * "Knights watching" — seats available + last convene + cron health.
 * Shape + label + counts; color is decorative only.
 */
export function KnightsWatchingChip() {
  const { data, error, mutate, isLoading } = useSWR('/api/help-desk/knights-watch', fetcher, {
    refreshInterval: 60_000,
  })

  return (
    <section
      className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
      aria-label="Knights watching status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
          Knights watching
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void mutate()}
            className="text-[10px] text-[#5a5a78] underline"
            aria-label="Refresh Knights watching status"
          >
            Refresh
          </button>
          <Link
            href="/help-desk"
            className="text-[10px] text-[#D4AF37] underline"
            aria-label="Open Help Desk"
          >
            Help Desk →
          </Link>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="mt-3 h-10 animate-pulse rounded-lg bg-[#1a1a26]" aria-hidden />
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge level={data.level} label={data.label} />
          <StatusBadge
            level={data.seatsConfigured > 0 ? 'ok' : 'error'}
            label={`Seats: ${data.seatsConfigured}`}
          />
          <StatusBadge
            level={data.autoKnightsOn ? 'ok' : 'warn'}
            label={data.autoKnightsOn ? 'Auto-Knights ON' : 'Auto-Knights OFF'}
          />
          <StatusBadge
            level={
              data.autoSendPermitActive || data.techAutoSendEnv ? 'ok' : 'unknown'
            }
            label={
              data.autoSendPermitActive
                ? 'Auto-send: permit'
                : data.techAutoSendEnv
                  ? 'Auto-send: TECH env'
                  : 'Auto-send: locked'
            }
          />
          <StatusBadge
            level={data.cronStale ? 'warn' : 'ok'}
            label={
              data.minutesSinceLastDrain == null
                ? 'Cron: never'
                : data.cronStale
                  ? `Cron: ${data.minutesSinceLastDrain}m stale`
                  : `Cron: ${data.minutesSinceLastDrain}m ago`
            }
          />
          <span className="font-mono text-[10px] tabular-nums text-[#5a5a78]">
            {data.minutesSinceLastConvene == null
              ? 'Last convene: never'
              : `Last convene: ${data.minutesSinceLastConvene}m ago`}
            {data.seatsLive.length > 0 ? ` · ${data.seatsLive.slice(0, 3).join(', ')}` : ''}
          </span>
        </div>
      ) : null}
    </section>
  )
}
