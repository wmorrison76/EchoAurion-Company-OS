import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { PilotHealth } from '@/types/dr-os'

export function PilotStatusPanel({ data }: { data?: PilotHealth }) {
  if (!data) return <SkeletonCard />

  return (
    <KPICard
      title="Pilot — Miccosukee"
      badge={<StatusBadge level={data.level} label={data.stage} />}
    >
      <div className="flex flex-col gap-1">
        <p className="font-mono text-lg font-semibold text-white">{data.name}</p>
        <p className="text-xs text-[#a0a0b8]">
          {data.daysSinceContact !== null
            ? `${data.daysSinceContact} day${data.daysSinceContact === 1 ? '' : 's'} since last contact`
            : (data.error ?? 'No contact recorded')}
        </p>
        {data.notes ? <p className="mt-1 text-xs text-[#5a5a78]">{data.notes}</p> : null}
      </div>
    </KPICard>
  )
}
