import type { StatusLevel } from '@/types'

export type NightCleanerChipState =
  | 'never_ingested'
  | 'ingest_ok_scanners_missing'
  | 'stale'
  | 'floor_walk_current'

/** Night Cleaner “last night” chip — PII-free. */
export type NightCleanerChipSnapshot = {
  level: StatusLevel
  shape: string
  label: string
  chipState: NightCleanerChipState
  score: number | null
  taskCount: number | null
  productLine: string | null
  ticketId: string | null
  ingestedAt: string | null
  /** Minutes since last ingest — null if never. */
  minutesSinceIngest: number | null
  stale: boolean
  /** Pilot floor-walk scanners are still unwired. */
  scannersMissing: boolean
}

/** HelpEval Friday / latest suite chip. */
export type HelpEvalChipSnapshot = {
  level: StatusLevel
  shape: string
  label: string
  score: number | null
  passed: number | null
  total: number | null
  runId: string | null
  fridaySimulation: boolean
  ranAt: string | null
  minutesSinceRun: number | null
  stale: boolean
}

/** Cost-anomaly scan + open alerts chip. */
export type CostAnomalyChipSnapshot = {
  level: StatusLevel
  shape: string
  label: string
  openAlerts: number
  lastScanAt: string | null
  minutesSinceScan: number | null
  lastAnomalyCount: number | null
  stale: boolean
}
