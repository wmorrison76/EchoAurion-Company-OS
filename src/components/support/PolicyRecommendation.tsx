'use client'

import { cn } from '@/lib/utils'
import type { PolicyVerdict } from '@/lib/support-policy'

const CHIP_STYLES: Record<PolicyVerdict['recommendation'], string> = {
  FREE_ANSWER: 'border-[#22c55e] text-white',
  COMPLIMENTARY_FIX: 'border-[#D4AF37] text-white',
  QUOTE_REQUIRED: 'border-[#f59e0b] text-white',
}

/** Colorblind-safe Free vs Charge chip: shape + label (+ optional tier). */
export function PolicyRecommendationChip({
  verdict,
  className,
}: {
  verdict: PolicyVerdict
  className?: string
}) {
  const tierSuffix = verdict.suggestedTier ? ` · ${verdict.suggestedTier}` : ''
  const text = `${verdict.label}${tierSuffix}`
  return (
    <span
      role="status"
      aria-label={`${verdict.label}${verdict.suggestedTier ? `, suggested ${verdict.suggestedTier}` : ''}. ${verdict.reason}`}
      title={verdict.reason}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-[#1a1a26] px-3 py-1 text-xs font-medium',
        CHIP_STYLES[verdict.recommendation],
        className
      )}
    >
      <span aria-hidden="true" className="font-mono leading-none">
        {verdict.shape}
      </span>
      <span>{text}</span>
    </span>
  )
}

/** Compact banner under a request with operator hint. */
export function PolicyRecommendationBanner({ verdict }: { verdict: PolicyVerdict }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-[#2a2a3f] bg-[#0a0a0f] px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      role="note"
      aria-label={`Policy recommendation: ${verdict.label}`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <PolicyRecommendationChip verdict={verdict} />
        <p className="text-[11px] text-[#a0a0b8]">{verdict.operatorHint}</p>
      </div>
      <p className="shrink-0 text-[11px] text-[#5a5a78]">{verdict.reason}</p>
    </div>
  )
}
