import Link from 'next/link'
import { KPICard } from '@/components/ui/KPICard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatUSD } from '@/lib/utils'
import type { RaiseTracker as RaiseTrackerData } from '@/types/revenue'

export function RaiseTracker({ raise }: { raise: RaiseTrackerData }) {
  return (
    <KPICard title="Angel Raise">
      <div className="flex flex-col gap-3">
        <ProgressBar
          value={raise.pct}
          achieved={raise.committed >= raise.target}
          label={`${formatUSD(raise.committed)} of ${formatUSD(raise.target)}`}
        />
        <div className="flex items-center justify-between text-xs">
          <Link
            href="/crm?tag=investor"
            className="text-[#D4AF37] underline"
            aria-label="View investor conversations in CRM"
          >
            {raise.conversations} active conversation{raise.conversations === 1 ? '' : 's'}
          </Link>
          <span className="text-[#5a5a78]">Update in admin or DB</span>
        </div>
      </div>
    </KPICard>
  )
}
