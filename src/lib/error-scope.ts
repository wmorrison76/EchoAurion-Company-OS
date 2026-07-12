/**
 * Error blast-radius scope engine.
 *
 * Provenance: ZARO / observability StructuredError (product repo
 * `server/lib/observability/error-schema.ts`) classified errors for
 * self-healing support. Company OS owns the Help Desk ticket + notify path.
 *
 * Scopes:
 *   USER    — one session/device
 *   ACCOUNT — one org / clientKey / property
 *   GLOBAL  — platform-wide (shared provider/bundle bugs)
 */

export type ErrorBlastScope = 'USER' | 'ACCOUNT' | 'GLOBAL'

/** Patterns that almost always mean a shared platform defect. */
const GLOBAL_PATTERNS: RegExp[] = [
  /must be used within a LanguageProvider/i,
  /LanguageProvider/i,
  /ChunkLoadError/i,
  /Loading chunk [\d]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Minified React error/i,
  /Invariant Violation/i,
  /hydrat(e|ion)/i,
]

const ACCOUNT_PATTERNS: RegExp[] = [
  /org[_-]?id/i,
  /tenant/i,
  /property/i,
  /client[_-]?key/i,
  /permission denied/i,
  /RLS/i,
]

export interface ScopeHints {
  message: string
  stack?: string | null
  moduleHint?: string | null
  errorClass?: string | null
  /** Client-suggested scope (advisory). */
  scopeHint?: ErrorBlastScope | null
  /** Distinct clientKeys already associated with this fingerprint. */
  knownClientKeys?: string[]
}

export function classifyErrorScope(hints: ScopeHints): ErrorBlastScope {
  const blob = `${hints.message}\n${hints.stack ?? ''}\n${hints.errorClass ?? ''}\n${hints.moduleHint ?? ''}`

  if (GLOBAL_PATTERNS.some((re) => re.test(blob))) return 'GLOBAL'

  // Multiple installs seeing the same fingerprint → platform-wide.
  const keys = new Set((hints.knownClientKeys ?? []).filter(Boolean))
  if (keys.size >= 2) return 'GLOBAL'

  if (hints.scopeHint === 'GLOBAL') return 'GLOBAL'
  if (hints.scopeHint === 'ACCOUNT') return 'ACCOUNT'
  if (ACCOUNT_PATTERNS.some((re) => re.test(blob))) return 'ACCOUNT'

  if (hints.scopeHint === 'USER') return 'USER'
  return 'USER'
}

export function scopeBadgeLabel(scope: ErrorBlastScope | null | undefined): string {
  if (scope === 'GLOBAL') return 'Global'
  if (scope === 'ACCOUNT') return 'Account'
  if (scope === 'USER') return 'User'
  return 'Unscoped'
}

export function scopeBadgeShape(scope: ErrorBlastScope | null | undefined): string {
  if (scope === 'GLOBAL') return '⬤'
  if (scope === 'ACCOUNT') return '◆'
  if (scope === 'USER') return '○'
  return '?'
}
