import { formatDistanceToNow } from 'date-fns'
import { KPICard, KPIValue } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { RenderDeployHealth } from '@/types/dr-os'

export function RenderDeployPanel({ data }: { data?: RenderDeployHealth }) {
  if (!data) return <SkeletonCard />

  return (
    <KPICard title="Render Deploy" badge={<StatusBadge level={data.level} label={data.label} />}>
      {data.error ? (
        <p className="text-sm text-[#a0a0b8]">Error: {data.error}</p>
      ) : (
        <KPIValue
          value={data.label}
          sub={
            [
              data.deployId ? `Deploy ${data.deployId.slice(0, 8)}` : null,
              data.triggeredAt
                ? formatDistanceToNow(new Date(data.triggeredAt), { addSuffix: true })
                : null,
              data.durationSeconds !== null ? `${data.durationSeconds}s` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'No deploy data'
          }
        />
      )}
    </KPICard>
  )
}
