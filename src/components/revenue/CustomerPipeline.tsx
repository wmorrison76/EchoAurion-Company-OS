import Link from 'next/link'
import { KPICard } from '@/components/ui/KPICard'
import type { CustomerPipeline as Pipeline } from '@/types/revenue'

export function CustomerPipeline({ pipeline }: { pipeline: Pipeline }) {
  const stages = [
    { label: 'Pilots', value: pipeline.pilots, href: '/crm?tag=pilot' },
    { label: 'Paying', value: pipeline.paying, href: null },
    { label: 'Churned (90d)', value: pipeline.churned, href: null },
  ]
  return (
    <KPICard title="Customer Pipeline" className="sm:col-span-2 xl:col-span-3">
      <div className="grid grid-cols-3 gap-3">
        {stages.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-1 rounded-xl border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-4 text-center"
          >
            <span className="font-mono text-2xl font-semibold tabular-nums text-white">
              {s.value}
            </span>
            {s.href ? (
              <Link href={s.href} className="text-xs text-[#D4AF37] underline">
                {s.label}
              </Link>
            ) : (
              <span className="text-xs text-[#a0a0b8]">{s.label}</span>
            )}
          </div>
        ))}
      </div>
    </KPICard>
  )
}
