import { KPICard, KPIValue } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatUSD } from '@/lib/utils'
import type { MRRPoint } from '@/types/revenue'

interface MRRChartProps {
  mrr: number
  customerCount: number
  configured: boolean
  error: string | null
  history: MRRPoint[]
}

// Dependency-free sparkline (CLAUDE.md §4.4 — no chart library).
export function MRRChart({ mrr, customerCount, configured, error, history }: MRRChartProps) {
  const max = Math.max(1, ...history.map((h) => h.mrr), mrr)
  const recent = history.slice(-24)

  return (
    <KPICard
      title="Monthly Recurring Revenue"
      className="sm:col-span-2"
      badge={
        configured ? (
          <StatusBadge level="ok" label="Live" />
        ) : (
          <StatusBadge level="unknown" label="Not configured" />
        )
      }
    >
      <div className="flex flex-col gap-4">
        <KPIValue
          value={formatUSD(mrr)}
          sub={
            error
              ? `Error: ${error}`
              : `${customerCount} active subscription${customerCount === 1 ? '' : 's'}`
          }
        />
        {recent.length > 1 ? (
          <div className="flex h-20 items-end gap-1" aria-hidden="true">
            {recent.map((h, i) => (
              <div
                key={`${h.date}-${i}`}
                className="flex-1 rounded-t bg-[#9c7f1e]"
                style={{ height: `${Math.max(4, Math.round((h.mrr / max) * 100))}%` }}
                title={`${formatUSD(h.mrr)}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#5a5a78]">
            History builds as the daily snapshot runs — no trend yet.
          </p>
        )}
      </div>
    </KPICard>
  )
}
