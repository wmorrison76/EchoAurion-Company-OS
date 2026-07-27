import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatUSD } from '@/lib/utils'
import type { RunwaySummary } from '@/types/financial'

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function RunwayCountdown({ runway }: { runway: RunwaySummary }) {
  const months = runway.months !== null ? runway.months.toFixed(1) : '∞'
  const oct1 = runway.oct1Date ? dateFmt.format(new Date(runway.oct1Date)) : '—'

  return (
    <KPICard
      title="Runway — Oct 1 Target"
      badge={
        runway.onTrack ? (
          <StatusBadge level="ok" label="On track" />
        ) : (
          <StatusBadge level="warn" label={`At risk · ${runway.daysShort}d short`} />
        )
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <p className="font-mono text-3xl font-semibold tabular-nums text-white">{months} mo</p>
          <p className="mt-1 text-xs text-[#a0a0b8]">of runway at the 90-day burn</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-[#a0a0b8]">Total cash</dt>
          <dd className="text-right font-mono tabular-nums text-white">
            {formatUSD(runway.totalCash)}
          </dd>
          <dt className="text-[#a0a0b8]">Monthly burn</dt>
          <dd className="text-right font-mono tabular-nums text-white">
            {formatUSD(runway.monthlyBurn)}
          </dd>
          <dt className="text-[#a0a0b8]">Oct 1 target</dt>
          <dd className="text-right text-white">
            {oct1} · {runway.daysToOct1}d
          </dd>
        </dl>
      </div>
    </KPICard>
  )
}
