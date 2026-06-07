import type { StatusLevel } from '@/types'
import type { ClientHealth } from '@/types/support'

const RANK: Record<ClientHealth, number> = { UNKNOWN: -1, GREEN: 0, AMBER: 1, RED: 2 }

export interface HealthInputs {
  online: boolean
  queueDepth: number
  errorCount: number
  lastSyncAt: Date | null
}

/**
 * Tier 0 client health — derived purely from passive diagnostics (no screen,
 * no remote control). Lets the console flag a property before they ever call.
 * Thresholds are deliberately conservative; tune once real telemetry lands.
 */
export function computeHealth(i: HealthInputs): ClientHealth {
  let level: ClientHealth = 'GREEN'
  const bump = (to: ClientHealth) => {
    if (RANK[to] > RANK[level]) level = to
  }
  if (!i.online) bump('AMBER')
  if (i.queueDepth > 0) bump('AMBER')
  if (i.queueDepth > 50) bump('RED')
  if (i.errorCount > 0) bump('AMBER')
  if (i.errorCount > 10) bump('RED')
  const hours = i.lastSyncAt ? (Date.now() - i.lastSyncAt.getTime()) / 3_600_000 : Infinity
  if (hours > 24) bump('AMBER')
  if (hours > 72) bump('RED')
  return level
}

export const HEALTH_TO_STATUS: Record<ClientHealth, StatusLevel> = {
  GREEN: 'ok',
  AMBER: 'warn',
  RED: 'error',
  UNKNOWN: 'unknown',
}

export const HEALTH_LABEL: Record<ClientHealth, string> = {
  GREEN: 'Healthy',
  AMBER: 'Attention',
  RED: 'At risk',
  UNKNOWN: 'Unknown',
}
