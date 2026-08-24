'use client'

import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { NightCleanerChipSnapshot } from '@/types/ops-chips'

/**
 * Night Cleaner “last night” — Morning Open readiness from last ingest.
 * Shape + label + score; link into Help Desk tickets.
 */
export function NightCleanerChip({ data }: { data?: NightCleanerChipSnapshot }) {
  const ticketsHref = data?.ticketId
    ? `/help-desk?ticket=${encodeURIComponent(data.ticketId)}`
    : '/help-desk'

  return (
    <section
      className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
      aria-label="Night Cleaner last night"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
          Night Cleaner
        </h2>
        <Link
          href={ticketsHref}
          className="text-[10px] text-[#D4AF37] underline"
          aria-label="Open Night Cleaner tickets in Help Desk"
        >
          Tickets →
        </Link>
      </div>

      {!data ? (
        <div className="mt-3 h-10 animate-pulse rounded-lg bg-[#1a1a26]" aria-hidden />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge level={data.level} label={data.label} />
          {data.score != null ? (
            <StatusBadge
              level={data.level}
              label={`Score: ${data.score}/100`}
            />
          ) : null}
          {data.taskCount != null ? (
            <StatusBadge
              level={data.taskCount > 0 ? 'warn' : 'ok'}
              label={`Tasks: ${data.taskCount}`}
            />
          ) : null}
          {data.scannersMissing ? (
            <StatusBadge level="warn" label="▲ Pilot scanners missing" />
          ) : null}
          <span className="font-mono text-[10px] tabular-nums text-[#5a5a78]">
            {data.minutesSinceIngest == null
              ? 'Last night: never'
              : data.minutesSinceIngest < 60
                ? `Last night: ${data.minutesSinceIngest}m ago`
                : `Last night: ${Math.round(data.minutesSinceIngest / 60)}h ago`}
            {data.productLine ? ` · ${data.productLine}` : ''}
          </span>
        </div>
      )}
    </section>
  )
}
