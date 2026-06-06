import { formatDistanceToNow } from 'date-fns'
import { actorLabel } from '@/lib/utils'
import type { AuditEntry } from '@/types/dr-os'

interface AuditLogRowProps {
  entry: AuditEntry
  /** Zebra striping (CLAUDE.md §4.3). */
  striped?: boolean
}

export function AuditLogRow({ entry, striped }: AuditLogRowProps) {
  const when = formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })
  return (
    <li
      className={`grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[7rem_5rem_1fr] ${
        striped ? 'bg-[#12121a]' : 'bg-[#0a0a0f]'
      }`}
    >
      <span className="font-mono text-xs text-[#5a5a78] tabular-nums">{when}</span>
      <span className="text-xs font-medium text-[#D4AF37]">{actorLabel(entry.actor)}</span>
      <span className="col-span-2 truncate text-[#a0a0b8] sm:col-span-1">
        <span className="font-mono text-white">{entry.action}</span>
        {entry.entityId ? <span className="ml-2 text-[#5a5a78]">{entry.entityId}</span> : null}
      </span>
    </li>
  )
}
