import { KPICard, KPIValue } from '@/components/ui/KPICard'
import { formatUSD } from '@/lib/utils'
import type { RevenueRunway } from '@/types/revenue'

export function RunwayCalculator({ runway }: { runway: RevenueRunway }) {
  const months = runway.months !== null ? `${runway.months.toFixed(1)} mo` : '∞'
  return (
    <KPICard title="Runway">
      <div className="flex flex-col gap-3">
        <KPIValue value={months} sub="cash ÷ 90-day burn" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-[#a0a0b8]">Total cash</dt>
          <dd className="text-right font-mono tabular-nums text-white">
            {formatUSD(runway.totalCash)}
          </dd>
          <dt className="text-[#a0a0b8]">Monthly burn</dt>
          <dd className="text-right font-mono tabular-nums text-white">
            {formatUSD(runway.monthlyBurn)}
          </dd>
        </dl>
      </div>
    </KPICard>
  )
}
