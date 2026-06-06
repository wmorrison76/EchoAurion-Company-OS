import { formatDistanceToNow } from 'date-fns'
import { KPICard, KPIValue } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { ActiveUsersHealth } from '@/types/dr-os'

export function ActiveUsersPanel({ data }: { data?: ActiveUsersHealth }) {
  if (!data) return <SkeletonCard />

  return (
    <KPICard title="Active Users" badge={<StatusBadge level={data.level} label={data.label} />}>
      {data.count !== null ? (
        <KPIValue
          value={data.count.toLocaleString('en-US')}
          sub={
            data.updatedAt
              ? `Updated ${formatDistanceToNow(new Date(data.updatedAt), { addSuffix: true })}`
              : '30-day active'
          }
        />
      ) : (
        <p className="text-sm text-[#a0a0b8]">{data.error ?? 'Unavailable'}</p>
      )}
    </KPICard>
  )
}
