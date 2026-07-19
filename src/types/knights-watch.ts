import type { StatusLevel } from '@/types'

/** PII-free Knights watch status for Help Desk / Dr. OS chips. */
export type KnightsWatchSnapshot = {
  /** Seats with API keys configured (draft-capable). */
  seatsConfigured: number
  /** Seat names that are live (no secrets). */
  seatsLive: string[]
  /** AUTO_KNIGHTS_ON_QUESTION effective (default true). */
  autoKnightsOn: boolean
  /** HELP_DESK_AUTO_SEND_TECH env unlock for low-risk TECH/OTHER TEXT. */
  techAutoSendEnv: boolean
  /** Timed permit currently active. */
  autoSendPermitActive: boolean
  /** Last help_desk.knights.dispatch audit ISO, or null. */
  lastConveneAt: string | null
  /** Minutes since last convene — null if never. */
  minutesSinceLastConvene: number | null
  /** ops-poll / drain stale (>20m or never). */
  cronStale: boolean
  minutesSinceLastDrain: number | null
  level: StatusLevel
  shape: string
  label: string
}
