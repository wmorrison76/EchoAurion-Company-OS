import { cn } from '@/lib/utils'

interface KPICardProps {
  title: string
  /** Right-aligned header slot, typically a StatusBadge. */
  badge?: React.ReactNode
  children: React.ReactNode
  className?: string
}

// KPI / panel container per CLAUDE.md §4.3.
export function KPICard({ title, badge, children, className }: KPICardProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-6',
        className
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-xs uppercase tracking-widest text-[#D4AF37]">{title}</h3>
        {badge}
      </header>
      <div>{children}</div>
    </section>
  )
}

interface KPIValueProps {
  value: string
  sub?: string
}

/** Large mono metric + optional sub-label (§4.2). */
export function KPIValue({ value, sub }: KPIValueProps) {
  return (
    <div>
      <p className="font-mono text-3xl font-semibold tabular-nums text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[#a0a0b8]">{sub}</p> : null}
    </div>
  )
}
