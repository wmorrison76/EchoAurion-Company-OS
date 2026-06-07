import { ContactCard } from './ContactCard'
import { DEAL_STAGE_LABEL } from '@/types/crm'
import type { BoardCard, DealStage } from '@/types/crm'

interface KanbanColumnProps {
  stage: DealStage
  cards: BoardCard[]
  onMove: (dealId: string, stage: DealStage) => void
}

export function KanbanColumn({ stage, cards, onMove }: KanbanColumnProps) {
  return (
    <div className="flex w-72 shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs uppercase tracking-widest text-[#D4AF37]">
          {DEAL_STAGE_LABEL[stage]}
        </h3>
        <span className="font-mono text-xs tabular-nums text-[#5a5a78]">{cards.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {cards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#2a2a3f] px-3 py-4 text-center text-xs text-[#5a5a78]">
            Empty
          </p>
        ) : (
          cards.map((card) => <ContactCard key={card.dealId} card={card} onMove={onMove} />)
        )}
      </div>
    </div>
  )
}
