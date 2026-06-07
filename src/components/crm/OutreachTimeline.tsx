import { format } from 'date-fns'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { actorLabel } from '@/lib/utils'
import type { OutreachDTO, OutreachStatus } from '@/types/crm'
import type { StatusLevel } from '@/types'

const STATUS_LEVEL: Record<OutreachStatus, StatusLevel> = {
  SENT: 'unknown',
  OPENED: 'warn',
  RESPONDED: 'ok',
  BOUNCED: 'error',
  NO_REPLY: 'unknown',
}

export function OutreachTimeline({ outreach }: { outreach: OutreachDTO[] }) {
  if (outreach.length === 0) {
    return <p className="text-sm text-[#a0a0b8]">No outreach logged yet.</p>
  }
  return (
    <ol className="flex flex-col gap-3">
      {outreach.map((o) => (
        <li
          key={o.id}
          className="rounded-xl border border-[#2a2a3f] bg-[#12121a] p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-widest text-[#D4AF37]">{o.channel}</span>
            <StatusBadge level={STATUS_LEVEL[o.status]} label={o.status.replace(/_/g, ' ')} />
          </div>
          {o.subject ? <p className="mt-2 text-sm font-medium text-white">{o.subject}</p> : null}
          {o.body ? <p className="mt-1 text-sm text-[#a0a0b8]">{o.body}</p> : null}
          <p className="mt-2 text-xs text-[#5a5a78]">
            {format(new Date(o.sentAt), 'MMM d, yyyy')} · {actorLabel(o.actor)}
          </p>
        </li>
      ))}
    </ol>
  )
}
