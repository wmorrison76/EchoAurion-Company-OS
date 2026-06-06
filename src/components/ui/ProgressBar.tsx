import { cn } from '@/lib/utils'

interface ProgressBarProps {
  /** 0..1 */
  value: number
  label?: string
  /** Distinguishes achieved vs needed by border, not color alone (§14.3). */
  achieved?: boolean
  className?: string
}

// Colorblind-safe: progress is conveyed by WIDTH + a TEXT percentage, never by
// color alone (CLAUDE.md §3 rule 4, §14.3).
export function ProgressBar({ value, label, achieved, className }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value))
  const pctText = `${Math.round(pct * 100)}%`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `Progress ${pctText}`}
        className={cn(
          'relative h-4 w-full overflow-hidden rounded-full border bg-[#0a0a0f]',
          achieved ? 'border-[#D4AF37]' : 'border-[#2a2a3f]'
        )}
      >
        <div
          className="h-full bg-[#D4AF37] transition-[width] duration-200"
          style={{ width: pctText }}
        />
      </div>
      {label ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#a0a0b8]">{label}</span>
          <span className="font-mono tabular-nums text-white">{pctText}</span>
        </div>
      ) : null}
    </div>
  )
}
