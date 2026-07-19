'use client'

import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { HelpEvalChipSnapshot } from '@/types/ops-chips'

/** HelpEval Friday / latest suite score on Dr. OS. */
export function HelpEvalChip({ data }: { data?: HelpEvalChipSnapshot }) {
  return (
    <section
      className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4"
      aria-label="HelpEval Friday status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[#D4AF37]">
          HelpEval
        </h2>
        <Link
          href="/lab/elite"
          className="text-[10px] text-[#D4AF37] underline"
          aria-label="Open Elite Lab eval suite"
        >
          Lab →
        </Link>
      </div>

      {!data ? (
        <div className="mt-3 h-10 animate-pulse rounded-lg bg-[#1a1a26]" aria-hidden />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge level={data.level} label={data.label} />
          {data.passed != null && data.total != null ? (
            <StatusBadge
              level={data.level}
              label={`${data.passed}/${data.total} passed`}
            />
          ) : null}
          <StatusBadge
            level={data.fridaySimulation ? 'ok' : 'unknown'}
            label={data.fridaySimulation ? 'Friday sim' : 'Manual / latest'}
          />
          <span className="font-mono text-[10px] tabular-nums text-[#5a5a78]">
            {data.minutesSinceRun == null
              ? 'Last run: never'
              : data.minutesSinceRun < 60
                ? `Last run: ${data.minutesSinceRun}m ago`
                : data.minutesSinceRun < 48 * 60
                  ? `Last run: ${Math.round(data.minutesSinceRun / 60)}h ago`
                  : `Last run: ${Math.round(data.minutesSinceRun / (60 * 24))}d ago`}
          </span>
        </div>
      )}
    </section>
  )
}
