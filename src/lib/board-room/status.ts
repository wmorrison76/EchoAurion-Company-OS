import type { StatusLevel } from '@/types'
import type { KnightStatus, SessionStatus } from '@/types/board-room'

export function knightLevel(status: KnightStatus): StatusLevel {
  switch (status) {
    case 'RESPONDED':
      return 'ok'
    case 'TIMEOUT':
      return 'warn'
    case 'ERROR':
      return 'error'
    default:
      return 'unknown' // PENDING | UNAVAILABLE
  }
}

const KNIGHT_LABEL: Record<KnightStatus, string> = {
  RESPONDED: 'Responded',
  PENDING: 'Pending',
  UNAVAILABLE: 'Unavailable',
  TIMEOUT: 'Timed out',
  ERROR: 'Error',
}
export const knightLabel = (s: KnightStatus): string => KNIGHT_LABEL[s]

const SESSION_LABEL: Record<SessionStatus, string> = {
  DISPATCHING: 'Dispatching',
  SYNTHESIZING: 'Synthesizing',
  COMPLETE: 'Complete',
  FAILED: 'Failed',
}
export const sessionLabel = (s: SessionStatus): string => SESSION_LABEL[s]

export function sessionLevel(s: SessionStatus): StatusLevel {
  if (s === 'COMPLETE') return 'ok'
  if (s === 'FAILED') return 'error'
  return 'warn'
}
