import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { PilotConnectionHealth } from '@/types/dr-os'

export function PilotConnectionPanel({ data }: { data?: PilotConnectionHealth }) {
  if (!data) return <SkeletonCard />

  return (
    <KPICard
      title="Pilot connection"
      badge={<StatusBadge level={data.level} label={data.label} />}
    >
      <div className="flex flex-col gap-1">
        <p className="font-mono text-3xl font-semibold tabular-nums text-white">
          {data.onlineCount}
          <span className="text-lg text-[#5a5a78]"> / {data.totalClients}</span>
        </p>
        <p className="text-xs text-[#a0a0b8]">
          online · {data.streamCount} stream
          {data.streamCount === 1 ? '' : 's'} · standby {data.standbyMode}
        </p>
        {data.standbyReviewCount > 0 ? (
          <p className="mt-1 text-xs text-[#f59e0b]">
            ⚠ {data.standbyReviewCount} standby review
            {data.standbyReviewCount === 1 ? '' : 's'}
          </p>
        ) : null}
        {data.error ? <p className="mt-1 text-xs text-[#5a5a78]">{data.error}</p> : null}
        <a
          href="/support/pilot-links"
          className="mt-2 text-xs text-[#D4AF37] underline"
          aria-label="Open Pilot links connection hub"
        >
          Pilot links →
        </a>
      </div>
    </KPICard>
  )
}
