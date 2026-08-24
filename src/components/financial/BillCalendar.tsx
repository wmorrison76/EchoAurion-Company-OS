import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatUSD } from '@/lib/utils'
import type { BillItem } from '@/types/financial'

function ordinal(day: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = day % 100
  return day + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export function BillCalendar({
  bills,
  rentSplitMonthlyTotal = 0,
}: {
  bills: BillItem[]
  rentSplitMonthlyTotal?: number
}) {
  const monthlyTotal = bills.reduce((s, b) => s + b.amount, 0)

  return (
    <KPICard title="Bill Calendar" className="sm:col-span-2">
      {bills.length === 0 ? (
        <p className="text-sm text-[#a0a0b8]">No bills configured yet</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-[#2a2a3f]">
            {bills.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{b.name}</p>
                  <p className="text-xs text-[#5a5a78]">
                    Due {ordinal(b.dueDay)} · {b.category}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {b.dueSoon ? <StatusBadge level="warn" label="Due Soon" /> : null}
                  <span className="font-mono text-sm tabular-nums text-white">
                    {formatUSD(b.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-[#2a2a3f] pt-3 text-xs">
            <span className="text-[#a0a0b8]">Monthly total</span>
            <span className="font-mono tabular-nums text-[#D4AF37]">{formatUSD(monthlyTotal)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[#a0a0b8]">
              Rent split (Apple Pay / Cash App / Zelle · $1,300–$1,600)
            </span>
            <span className="flex items-center gap-2">
              {rentSplitMonthlyTotal > 0 ? (
                <StatusBadge level="warn" label="Rent split" />
              ) : (
                <StatusBadge level="unknown" label="None this month" />
              )}
              <span className="font-mono tabular-nums text-white">
                {formatUSD(rentSplitMonthlyTotal)}
              </span>
            </span>
          </div>
        </>
      )}
    </KPICard>
  )
}
