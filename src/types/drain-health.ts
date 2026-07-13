import type { StatusLevel } from '@/types'

/** PII-free dead-letter / ingest-drain health for Dr. OS. */
export type DrainHealthSnapshot = {
  pending: number
  running: number
  failed: number
  stuckOutbox: number
  lastPollAt: string | null
  lastDrainAt: string | null
  /** Minutes since last ops.poll_failures (or drain) audit — null if never. */
  minutesSinceLastDrain: number | null
  level: StatusLevel
  shape: string
  label: string
}
