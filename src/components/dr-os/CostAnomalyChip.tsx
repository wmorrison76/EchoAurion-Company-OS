'use client'

import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { CostAnomalyChipSnapshot } from '@/types/ops-chips'

/** Cost-anomaly scan + open Alert count on Dr. OS. */
export function CostAnomalyChip({ data }: { data?: CostAnomalyChipSnapshot }) {
  return (
    <section
      className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
      aria-label="Cost anomaly status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
          Cost anomaly
        </h2>
        <Link
          href="/fleet-nexus"
          className="text-[10px] text-[#D4AF37] underline"
          aria-label="Open Fleet Nexus cost table"
        >
          Fleet →
        </Link>
      </div>

      {!data ? (
        <div className="mt-3 h-10 animate-pulse rounded-lg bg-[#1a1a26]" aria-hidden />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge level={data.level} label={data.label} />
          <StatusBadge
            level={data.openAlerts > 0 ? 'warn' : 'ok'}
            label={`Open alerts: ${data.openAlerts}`}
          />
          {data.lastAnomalyCount != null ? (
            <StatusBadge
              level={data.lastAnomalyCount > 0 ? 'warn' : 'ok'}
              label={`Last scan hits: ${data.lastAnomalyCount}`}
            />
          ) : null}
          <span className="font-mono text-[10px] tabular-nums text-[#5a5a78]">
            {data.minutesSinceScan == null
              ? 'Last scan: never'
              : data.minutesSinceScan < 60
                ? `Last scan: ${data.minutesSinceScan}m ago`
                : `Last scan: ${Math.round(data.minutesSinceScan / 60)}h ago`}
          </span>
        </div>
      )}
    </section>
  )
}
