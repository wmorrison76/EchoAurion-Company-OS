import { KPICard, KPIValue } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { NeonHealth } from '@/types/dr-os'

export function NeonDBPanel({ data }: { data?: NeonHealth }) {
  if (!data) return <SkeletonCard />

  return (
    <KPICard title="Neon DB" badge={<StatusBadge level={data.level} label={data.label} />}>
      {data.level === 'ok' ? (
        <KPIValue
          value={data.responseMs !== null ? `${data.responseMs} ms` : '—'}
          sub={data.database ? `Database: ${data.database}` : 'Connected'}
        />
      ) : (
        <p className="text-sm text-[#a0a0b8]">Error: {data.error ?? 'Unreachable'}</p>
      )}
    </KPICard>
  )
}
