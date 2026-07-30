import type { StatusLevel } from '@/types'

/** PII-free dead-letter / ingest-drain health for Dr. OS. */
export type DrainHealthSnapshot = {
  pending: number
  running: number
  failed: number
  stuckOutbox: number
  /** Pending text_knights jobs (Help Desk relay path). */
  knightPending: number
  /** RUNNING text_knights jobs. */
  knightRunning: number
  lastPollAt: string | null
  lastDrainAt: string | null
  /** Minutes since last ops.poll_failures (or drain) audit — null if never. */
  minutesSinceLastDrain: number | null
  lastKnightDrainAt: string | null
  /** Minutes since last ops.drain_knight_queue audit — null if never. */
  minutesSinceKnightDrain: number | null
  level: StatusLevel
  shape: string
  label: string
}
