import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { formatUSD } from '@/lib/utils'
import { DEAL_STAGES, DEAL_STAGE_LABEL } from '@/types/crm'
import type { BoardCard, DealStage } from '@/types/crm'

interface ContactCardProps {
  card: BoardCard
  onMove: (dealId: string, stage: DealStage) => void
}

export function ContactCard({ card, onMove }: ContactCardProps) {
  const display = card.company ?? card.name
  const sub = card.company ? card.title ?? card.name : card.title

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#2a2a3f] bg-[#12121a] p-3">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/crm/${card.contactId}`}
          className="min-w-0 transition-colors duration-150 hover:text-[#D4AF37]"
          aria-label={`Open ${display}`}
        >
          <p className="truncate text-sm font-medium text-white">{display}</p>
          {sub ? <p className="truncate text-xs text-[#5a5a78]">{sub}</p> : null}
        </Link>
        {card.value !== null ? (
          <span className="shrink-0 font-mono text-xs tabular-nums text-[#D4AF37]">
            {formatUSD(card.value)}
          </span>
        ) : null}
      </div>

      {card.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {card.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-[#2a2a3f] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#a0a0b8]"
            >
              {t.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-[#5a5a78]">
          {card.lastOutreachAt
            ? formatDistanceToNow(new Date(card.lastOutreachAt), { addSuffix: true })
            : 'no outreach'}
        </span>
        <label className="sr-only" htmlFor={`stage-${card.dealId}`}>
          Move {display} to a stage
        </label>
        <select
          id={`stage-${card.dealId}`}
          value={card.stage}
          onChange={(e) => onMove(card.dealId, e.target.value as DealStage)}
          aria-label={`Stage for ${display}`}
          className="rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-2 py-1 text-[11px] text-white outline-none focus:border-[#D4AF37]"
        >
          {DEAL_STAGES.map((s) => (
            <option key={s} value={s}>
              {DEAL_STAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
