/**
 * Night Cleaner Mole — Morning Open Report contract.
 * See docs/NIGHT_CLEANER_MOLE.md.
 *
 * Colorblind-safe status: always shape + label (✓ / ▲ / ✕ / ?).
 * No PII in any field — counts, keys, hashes, and scrubbed messages only.
 */

export type NightCleanerStatus = 'ok' | 'warn' | 'error' | 'unknown' | 'skipped'

export type NightCleanerShape = '✓' | '▲' | '✕' | '?'

export type NightCleanerSource = 'cron' | 'ekg_export' | 'ci'

export type NightCleanerPathKind = 'guest' | 'operator' | 'ops' | 'both'

/** Checklist categories — top 10 + expand. */
export type NightCleanerCategoryId =
  | 'broken_links'
  | 'stubs_placeholders'
  | 'panel_registry'
  | 'panel_sweep'
  | 'role_gates'
  | 'empty_states'
  | 'i18n'
  | 'env_config'
  | 'deploy_readiness'
  | 'program_backlog'
  | 'a11y_smoke'
  | 'mobile_390'
  | 'multi_browser'
  | 'bundle_lighthouse'
  | 'integration_heartbeat'
  | 'sentry_quality'
  | 'npm_audit'
  | 'secrets_scan'
  | 'telemetry_summary'

export interface NightCleanerStatusView {
  status: NightCleanerStatus
  shape: NightCleanerShape
  /** Human label, e.g. "Ready for morning open" */
  label: string
}

export interface NightCleanerFinding {
  id: string
  category: NightCleanerCategoryId
  pathKind: NightCleanerPathKind
  status: NightCleanerStatus
  shape: NightCleanerShape
  label: string
  /** Short scrubbed detail — panel key, route, package name. Never PII. */
  detail?: string
  /** Opaque ref (panel key, route path, package) */
  ref?: string
}

export interface NightCleanerCategoryResult {
  id: NightCleanerCategoryId
  title: string
  pathKind: NightCleanerPathKind
  overall: NightCleanerStatusView
  findings: NightCleanerFinding[]
  /** Scanner did not run this pass */
  skipped?: boolean
  skipReason?: string
}

export interface NightCleanerTask {
  id: string
  title: string
  status: NightCleanerStatus
  shape: NightCleanerShape
  label: string
  pathKind: NightCleanerPathKind
  category: NightCleanerCategoryId
  /** Priority hint for Help Desk — not auto-applied without ingest rules */
  priorityHint: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  findingIds: string[]
}

export interface NightCleanerTelemetrySummary {
  panelPassCount?: number
  panelOk?: number
  panelSlow?: number
  panelBlank?: number
  panelTimeout?: number
  panelError?: number
  /** Error events overnight — count only */
  errorEventCount?: number
  /** Window description, e.g. "last_8h" */
  window?: string
}

export interface NightCleanerReport {
  schemaVersion: 1
  runId: string
  startedAt: string
  finishedAt: string
  source: NightCleanerSource
  productLine: 'echoaurion' | 'company-os' | 'aurion-index' | 'unknown'
  repo: string
  gitSha?: string
  environment: 'staging' | 'production' | 'local'
  overall: NightCleanerStatusView & { score0to100: number }
  telemetrySummary?: NightCleanerTelemetrySummary
  categories: NightCleanerCategoryResult[]
  tasks: NightCleanerTask[]
  /**
   * Plain-English system improvements for day shift / William —
   * not just breaks: slow panels, “Coming soon” buttons, unfinished stubs.
   * Report is a task list — never auto-remodel overnight.
   */
  systemImprovements?: string[]
  /** Optional ideas William isn’t thinking of — hospitality-flavored */
  expandIdeas?: string[]
  /** Markdown mirror for ops inbox (optional) */
  markdownPreview?: string
}

export interface NightCleanerIngestResult {
  accepted: boolean
  runId: string
  overall: NightCleanerStatusView & { score0to100: number }
  ticketId: string | null
  ticketCreated: boolean
  taskCount: number
  label: string
}

export const NIGHT_CLEANER_SCHEMA_VERSION = 1 as const

export function statusToShape(status: NightCleanerStatus): NightCleanerShape {
  switch (status) {
    case 'ok':
      return '✓'
    case 'warn':
      return '▲'
    case 'error':
      return '✕'
    default:
      return '?'
  }
}

export function statusToMorningLabel(status: NightCleanerStatus): string {
  switch (status) {
    case 'ok':
      return 'Ready for morning open'
    case 'warn':
      return 'Needs day-shift attention'
    case 'error':
      return 'Blocks morning open'
    case 'skipped':
      return 'Scanner skipped'
    default:
      return 'Unknown — review required'
  }
}
