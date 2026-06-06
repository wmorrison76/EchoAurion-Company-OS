import { cn } from '@/lib/utils'
import type { StatusLevel } from '@/types'

// Colorblind-safe by construction (CLAUDE.md §3 rule 4, §4.3): every badge
// renders a SHAPE (icon glyph) + a TEXT LABEL. Color is decorative only —
// remove all color and the badge is still fully legible.
const GLYPH: Record<StatusLevel, string> = {
  ok: '✓',
  warn: '⚠',
  error: '✕',
  unknown: '?',
}

const STYLES: Record<StatusLevel, string> = {
  ok: 'border-[#22c55e] text-[#ffffff]',
  warn: 'border-[#f59e0b] text-[#ffffff]',
  error: 'border-[#ef4444] text-[#ffffff]',
  unknown: 'border-[#6b7280] text-[#a0a0b8]',
}

interface StatusBadgeProps {
  level: StatusLevel
  label: string
  /** Optional trailing count, rendered after the label. */
  count?: number | null
  className?: string
}

export function StatusBadge({ level, label, count, className }: StatusBadgeProps) {
  const text = count !== undefined && count !== null ? `${label} · ${count}` : label
  return (
    <span
      role="status"
      aria-label={`${label}${count !== undefined && count !== null ? `, ${count}` : ''}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-[#1a1a26] px-3 py-1 text-xs font-medium',
        STYLES[level],
        className
      )}
    >
      <span aria-hidden="true" className="font-mono leading-none">
        {GLYPH[level]}
      </span>
      <span>{text}</span>
    </span>
  )
}
