import { KPICard } from '@/components/ui/KPICard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatUSD } from '@/lib/utils'
import type { SalaryTarget } from '@/types/revenue'

export function SalaryTargetBar({ salary }: { salary: SalaryTarget }) {
  const achieved = salary.current >= salary.target
  return (
    <KPICard title="Founder Salary Target">
      <div className="flex flex-col gap-3">
        <ProgressBar
          value={salary.pct}
          achieved={achieved}
          label={`${formatUSD(salary.current)} of ${formatUSD(salary.target)}/mo`}
        />
        <p className="text-xs text-[#a0a0b8]">
          {achieved
            ? 'Founder salary fully covered by MRR.'
            : `Need ${formatUSD(salary.remaining)} more MRR to replace founder salary.`}
        </p>
      </div>
    </KPICard>
  )
}
