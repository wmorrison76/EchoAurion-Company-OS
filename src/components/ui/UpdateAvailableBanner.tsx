'use client'

/**
 * Soft “update available” banner — production-safe path for code fixes.
 *
 * Architecture (honest):
 * - Draft PR → merge → Render/Railway deploy → users need a **new JS bundle**.
 * - HMR is **dev-only**. Production cannot silently hot-swap broken Chronos modules.
 * - What CAN be real-time without losing work: relay `show_message` / `open_panel`,
 *   config flags, SSE answers, soft directives — not silent JS patch of the SPA.
 * - Ideal UX: soft banner “Update ready — save & reload when convenient”
 *   (never force-wipe in-progress form state).
 *
 * This scaffold is a presentational banner for Company OS (and a pattern for pilot).
 * Wire detection separately (e.g. compare build id / relay `feature_available`).
 * See docs/UPDATE_WITHOUT_LOSING_WORK.md.
 */

import { cn } from '@/lib/utils'

export interface UpdateAvailableBannerProps {
  /** When false, renders nothing */
  visible?: boolean
  /** Short title — default hospitality-safe copy */
  title?: string
  /** Supporting sentence */
  body?: string
  /** Called when user chooses to reload (caller should persist drafts first if needed) */
  onReload?: () => void
  /** Called when user dismisses until later */
  onDismiss?: () => void
  className?: string
}

export function UpdateAvailableBanner({
  visible = true,
  title = 'Update ready',
  body = 'Save your work, then reload when convenient. Open forms are not wiped until you reload.',
  onReload,
  onDismiss,
  className,
}: UpdateAvailableBannerProps) {
  if (!visible) return null

  return (
    <div
      role="status"
      aria-label={`${title}. ${body}`}
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <span aria-hidden="true">▲</span>
          <span className="text-[#D4AF37]">{title}</span>
          <span className="text-[#a0a0b8]">· save &amp; reload when convenient</span>
        </p>
        <p className="text-xs text-[#a0a0b8]">{body}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss update banner — reload later"
            className="rounded-lg border border-[#2a2a3f] bg-[#1a1a26] px-3 py-2 text-xs text-[#a0a0b8] transition-colors duration-150 hover:bg-[#22223a] hover:text-white"
          >
            Later
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (onReload) onReload()
            else if (typeof window !== 'undefined') window.location.reload()
          }}
          aria-label="Reload now to apply update"
          className="rounded-lg border border-[#D4AF37] bg-[#1a1a26] px-3 py-2 text-xs font-medium text-[#D4AF37] transition-colors duration-150 hover:bg-[#22223a]"
        >
          Reload now
        </button>
      </div>
    </div>
  )
}
