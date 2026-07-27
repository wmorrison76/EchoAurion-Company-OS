/**
 * Strip emails, tokens, JWTs, PATs, env dumps, and long query strings from
 * error / CI / deploy payloads before DB / Knights context.
 * Never store raw secrets in Help Desk or Echo learning chunks.
 * Health-adjacent / HIPAA-oriented terms are scrubbed for learning/repair telemetry.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
const BEARER_RE = /(?:Bearer|token|api[_-]?key|authorization)\s*[=:]\s*['"]?[^\s'"&,;]{8,}/gi
const SECRET_ASSIGN_RE =
  /(?:password|passwd|secret|apiKey|api_key|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[=:]\s*['"]?[^\s'"&,;]{4,}/gi
const GITHUB_PAT_RE = /\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/g
const STRIPE_KEY_RE = /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{16,}\b/g
const ENV_DUMP_RE =
  /(?:^|[\s;])(?:export\s+)?([A-Z][A-Z0-9_]{2,})\s*=\s*['"]?[^\s'"]{8,}/gm
const HEX_TOKEN_RE = /\b[a-f0-9]{32,}\b/gi
const LONG_QUERY_RE = /(\?[^\s]{80,})/g
const PATH_QUERY_RE = /(https?:\/\/[^\s]+)\?[^\s]*/gi
const PHONE_RE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g
/** Health-adjacent / guest medical-ish phrases — never in learning or fleet chunks. */
const HEALTH_ADJACENT_RE =
  /\b(?:HIPAA|PHI|diagnosis|diagnosed|prescription|medical\s+record|patient\s+id|allergy\s+to|blood\s+type|disability|pregnancy|HIV|AIDS)\b/gi

export function redactSensitive(input: string | null | undefined, max = 4000): string {
  if (!input) return ''
  let s = input
  s = s.replace(EMAIL_RE, '[redacted-email]')
  s = s.replace(PHONE_RE, '[redacted-phone]')
  s = s.replace(HEALTH_ADJACENT_RE, '[redacted-health]')
  s = s.replace(JWT_RE, '[redacted-jwt]')
  s = s.replace(GITHUB_PAT_RE, '[redacted-github-pat]')
  s = s.replace(STRIPE_KEY_RE, '[redacted-stripe-key]')
  s = s.replace(BEARER_RE, '[redacted-token]')
  s = s.replace(SECRET_ASSIGN_RE, '[redacted-secret]')
  s = s.replace(ENV_DUMP_RE, ' [redacted-env]')
  s = s.replace(HEX_TOKEN_RE, '[redacted-hex]')
  s = s.replace(PATH_QUERY_RE, '$1?[redacted-qs]')
  s = s.replace(LONG_QUERY_RE, '?[redacted-long-qs]')
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function redactStack(stack: string | null | undefined): string | null {
  if (!stack) return null
  return redactSensitive(stack, 4000)
}

export function redactMessage(message: string | null | undefined): string {
  return redactSensitive(message || 'Unknown error', 500)
}

/**
 * Post-redact gate for GLOBAL/COHORT promotion — reject if residual PII patterns remain.
 * Placeholders like [redacted-email] are fine; live emails/phones/health terms are not.
 */
export function assertPiiFree(
  input: string | null | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!input?.trim()) return { ok: true }
  // Ignore already-redacted placeholders
  const probe = input
    .replace(/\[redacted-[a-z0-9-]+\]/gi, '')
    .replace(/\[other-tenant-redacted\]/gi, '')
  if (EMAIL_RE.test(probe)) {
    EMAIL_RE.lastIndex = 0
    return { ok: false, reason: 'residual_email' }
  }
  EMAIL_RE.lastIndex = 0
  if (PHONE_RE.test(probe)) {
    PHONE_RE.lastIndex = 0
    return { ok: false, reason: 'residual_phone' }
  }
  PHONE_RE.lastIndex = 0
  if (HEALTH_ADJACENT_RE.test(probe)) {
    HEALTH_ADJACENT_RE.lastIndex = 0
    return { ok: false, reason: 'residual_health_adjacent' }
  }
  HEALTH_ADJACENT_RE.lastIndex = 0
  if (JWT_RE.test(probe) || GITHUB_PAT_RE.test(probe) || STRIPE_KEY_RE.test(probe)) {
    JWT_RE.lastIndex = 0
    GITHUB_PAT_RE.lastIndex = 0
    STRIPE_KEY_RE.lastIndex = 0
    return { ok: false, reason: 'residual_secret' }
  }
  JWT_RE.lastIndex = 0
  GITHUB_PAT_RE.lastIndex = 0
  STRIPE_KEY_RE.lastIndex = 0
  return { ok: true }
}
