import { KPICard } from '@/components/ui/KPICard'
import { AuditLogRow } from '@/components/ui/AuditLogRow'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { AuditEntry } from '@/types/dr-os'

interface AuditTrailPanelProps {
  entries?: AuditEntry[]
  error?: string
}

export function AuditTrailPanel({ entries, error }: AuditTrailPanelProps) {
  if (!entries && !error) return <SkeletonCard />

  return (
    <KPICard title="Audit Trail" className="sm:col-span-2 xl:col-span-3">
      {error ? (
        <p className="text-sm text-[#a0a0b8]">Error: {error}</p>
      ) : entries && entries.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-[#2a2a3f]">
          {entries.map((entry, i) => (
            <AuditLogRow key={entry.id} entry={entry} striped={i % 2 === 0} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#a0a0b8]">No actions recorded yet</p>
      )}
    </KPICard>
  )
}
