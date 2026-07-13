/**
 * Guest-impact mode — meal-period-critical modules auto-escalate priority.
 * Floor-facing copy must never include stack traces (operator thread only).
 */

const MEAL_CRITICAL_MODULES = [
  'beo',
  'banquet',
  'schedule',
  'labor',
  'pos',
  'toast',
  'micros',
  'check',
  'folio',
  'print',
  'printer',
  'kitchen',
  'kds',
  'expo',
  'menu',
  'ordering',
] as const

export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

const PRIORITY_RANK: Record<TicketPriority, number> = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  URGENT: 4,
}

/** True when moduleHint hits meal/service-critical product surface. */
export function isGuestImpactModule(moduleHint: string | null | undefined): boolean {
  if (!moduleHint?.trim()) return false
  const raw = moduleHint.toLowerCase()
  const tokens = raw.split(/[^a-z0-9]+/).filter(Boolean)
  return MEAL_CRITICAL_MODULES.some(
    (m) => raw === m || raw.includes(m) || tokens.includes(m)
  )
}

export function priorityRank(p: string | null | undefined): number {
  if (p === 'URGENT' || p === 'HIGH' || p === 'NORMAL' || p === 'LOW') {
    return PRIORITY_RANK[p]
  }
  return PRIORITY_RANK.NORMAL
}

/** Escalate at least to HIGH (URGENT if already higher / GLOBAL). Never downgrade. */
export function escalateForGuestImpact(
  current: string,
  opts?: { forceUrgent?: boolean }
): TicketPriority {
  const base =
    current === 'URGENT' || current === 'HIGH' || current === 'NORMAL' || current === 'LOW'
      ? current
      : 'NORMAL'
  const target: TicketPriority = opts?.forceUrgent ? 'URGENT' : 'HIGH'
  return PRIORITY_RANK[target] >= PRIORITY_RANK[base] ? target : base
}

/** Floor-safe recovery copy — no stacks, no fingerprints. */
export function guestImpactFloorCopy(moduleHint: string | null | undefined): {
  title: string
  body: string
} {
  const mod = moduleHint?.trim() || 'ops'
  return {
    title: 'Service tools recovering',
    body: `We’re fixing an issue that may affect ${mod} during service. Staff can continue — no action needed unless a screen is stuck. Guests should not see technical details.`,
  }
}
