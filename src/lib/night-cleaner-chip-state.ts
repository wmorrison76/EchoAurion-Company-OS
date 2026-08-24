import type { NightCleanerChipState } from '@/types/ops-chips'

/** Four honest Night Cleaner chip states — shape + label, not color alone. */
export function nightCleanerChipState(input: {
  ingested: boolean
  stale: boolean
  nightCleanerCronWired: boolean
}): NightCleanerChipState {
  if (!input.ingested) return 'never_ingested'
  if (input.stale) return 'stale'
  if (!input.nightCleanerCronWired) return 'ingest_ok_scanners_missing'
  return 'floor_walk_current'
}
