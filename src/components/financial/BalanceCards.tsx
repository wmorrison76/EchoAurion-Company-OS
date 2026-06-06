import { formatDistanceToNow } from 'date-fns'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatUSD } from '@/lib/utils'
import type { BalanceCard } from '@/types/financial'

export function BalanceCards({ balances }: { balances: BalanceCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {balances.map((b) => (
        <section
          key={b.id}
          className="flex flex-col gap-3 rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-6"
        >
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{b.name}</p>
              <p className="truncate text-xs text-[#a0a0b8]">
                {b.institution}
                {b.mask ? ` ····${b.mask}` : ''}
              </p>
            </div>
            <StatusBadge level={b.level} label={b.statusLabel} />
          </header>
          <div>
            <p className="font-mono text-3xl font-semibold tabular-nums text-white">
              {formatUSD(b.current)}
            </p>
            <p className="mt-1 text-xs text-[#a0a0b8]">
              {b.available !== null ? `${formatUSD(b.available)} available · ` : ''}
              {b.lastSynced
                ? `synced ${formatDistanceToNow(new Date(b.lastSynced), { addSuffix: true })}`
                : 'never synced'}
            </p>
          </div>
        </section>
      ))}
    </div>
  )
}
