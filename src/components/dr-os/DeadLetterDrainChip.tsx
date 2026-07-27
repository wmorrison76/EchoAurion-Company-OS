'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { APIResponse } from '@/types'
import type { DrainHealthSnapshot } from '@/types/drain-health'

async function fetcher(url: string): Promise<DrainHealthSnapshot> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = (await res.json()) as APIResponse<DrainHealthSnapshot>
  if (!body.success) throw new Error(body.error)
  return body.data
}

/**
 * Compact dead-letter / ingest-drain health on Dr. OS.
 * Shape + label + counts — color is decorative only.
 */
export function DeadLetterDrainChip() {
  const { data, error, mutate, isLoading } = useSWR('/api/dr-os/drain-health', fetcher, {
    refreshInterval: 60_000,
  })

  return (
    <section
      className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
      aria-label="Dead letter drain health"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
          Dead-letter drain
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void mutate()}
            className="text-[10px] text-[#5a5a78] underline"
            aria-label="Refresh drain health"
          >
            Refresh
          </button>
          <Link
            href="/help-desk"
            className="text-[10px] text-[#D4AF37] underline"
            aria-label="Open Help Desk delivery ops"
          >
            Delivery ops →
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
            level={data.failed > 0 ? 'error' : 'ok'}
            label={`Failed ingest: ${data.failed}`}
          />
          <StatusBadge
            level={data.stuckOutbox > 0 ? 'warn' : 'ok'}
            label={`Stuck outbox: ${data.stuckOutbox}`}
          />
          <StatusBadge
            level={data.pending > 50 ? 'warn' : 'ok'}
            label={`Pending: ${data.pending}`}
          />
          <span className="font-mono text-[10px] tabular-nums text-[#5a5a78]">
            {data.minutesSinceLastDrain == null
              ? 'Last drain: never'
              : `Last drain: ${data.minutesSinceLastDrain}m ago`}
          </span>
        </div>
      ) : null}
    </section>
  )
}
