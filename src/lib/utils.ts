import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Formats a USD amount as `$X,XXX.XX` (CLAUDE.md §23). */
export function formatUSD(amount: number): string {
  return usd.format(Number.isFinite(amount) ? amount : 0)
}

const compactUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Compact USD for large headline figures (e.g. `$500K`). */
export function formatUSDCompact(amount: number): string {
  return compactUsd.format(Number.isFinite(amount) ? amount : 0)
}

/** Truncates a string to `max` chars with an ellipsis. */
export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/** Human-readable actor alias for the audit trail (CLAUDE.md §10.3). */
export function actorLabel(actor: string): string {
  if (actor === 'william_morrison') return 'William'
  if (actor === 'computer_agent') return 'Computer'
  return actor
}
