import { KPICard, KPIValue } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { formatUSD } from '@/lib/utils'
import type { StripeMRRHealth } from '@/types/dr-os'

export function StripeMRRPanel({ data }: { data?: StripeMRRHealth }) {
  if (!data) return <SkeletonCard />

  return (
    <KPICard title="Stripe MRR" badge={<StatusBadge level={data.level} label={data.label} />}>
      <KPIValue
        value={formatUSD(data.mrr)}
        sub={
          data.error
            ? `Error: ${data.error}`
            : `${data.subscriptionCount} active subscription${data.subscriptionCount === 1 ? '' : 's'}`
        }
      />
    </KPICard>
  )
}
