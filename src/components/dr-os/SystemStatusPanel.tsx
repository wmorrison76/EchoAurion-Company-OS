import { formatDistanceToNow } from 'date-fns'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { StatusLevel } from '@/types'
import type { DrOsStatus } from '@/types/dr-os'

function tally(status: DrOsStatus): Record<StatusLevel, number> {
  const counts: Record<StatusLevel, number> = { ok: 0, warn: 0, error: 0, unknown: 0 }
  const levels: StatusLevel[] = [
    ...status.github.map((g) => g.level),
    status.render.level,
    status.neon.level,
    status.stripe.level,
    status.activeUsers.level,
    status.pilot.level,
    status.pilotConnection.level,
    status.drain.level,
    status.nightCleaner.level,
    status.helpEval.level,
    status.costAnomaly.level,
  ]
  for (const l of levels) counts[l] += 1
  return counts
}

export function SystemStatusPanel({ status }: { status?: DrOsStatus }) {
  if (!status) return <SkeletonCard />

  const counts = tally(status)
  const overall: StatusLevel =
    counts.error > 0 ? 'error' : counts.warn > 0 ? 'warn' : counts.unknown > 0 ? 'unknown' : 'ok'
  const overallLabel =
    overall === 'ok'
      ? 'All Systems Healthy'
      : overall === 'warn'
        ? 'Attention Needed'
        : overall === 'error'
          ? 'Action Required'
          : 'Partial Visibility'

  return (
    <KPICard
      title="System Status"
      badge={<StatusBadge level={overall} label={overallLabel} />}
      className="sm:col-span-2 xl:col-span-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge level="ok" label="Healthy" count={counts.ok} />
        <StatusBadge level="warn" label="Warning" count={counts.warn} />
        <StatusBadge level="error" label="Error" count={counts.error} />
        <StatusBadge level="unknown" label="Unknown" count={counts.unknown} />
        <span className="ml-auto text-xs text-[#5a5a78]">
          Updated {formatDistanceToNow(new Date(status.generatedAt), { addSuffix: true })}
        </span>
      </div>
    </KPICard>
  )
}
