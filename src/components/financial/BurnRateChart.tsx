import { KPICard } from '@/components/ui/KPICard'
import { formatUSD } from '@/lib/utils'
import type { BurnRate } from '@/types/financial'

// Simple, dependency-free bar comparison (CLAUDE.md §4.4 — no chart library).
export function BurnRateChart({ burn }: { burn: BurnRate }) {
  const rows = [
    { label: '30-day', value: burn.thirtyDay },
    { label: '60-day', value: burn.sixtyDay },
    { label: '90-day average', value: burn.ninetyDay, primary: true },
  ]
  const max = Math.max(1, ...rows.map((r) => r.value))

  return (
    <KPICard title="Burn Rate" className="sm:col-span-2">
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className={r.primary ? 'font-medium text-white' : 'text-[#a0a0b8]'}>
                {r.label}
              </span>
              <span className="font-mono tabular-nums text-white">{formatUSD(r.value)}/mo</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full border border-[#2a2a3f] bg-[#0a0a0f]">
              <div
                className={r.primary ? 'h-full bg-[#D4AF37]' : 'h-full bg-[#9c7f1e]'}
                style={{ width: `${Math.round((r.value / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </KPICard>
  )
}
