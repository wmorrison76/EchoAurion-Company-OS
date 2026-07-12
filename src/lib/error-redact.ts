/**
 * Strip emails, tokens, JWTs, and long query strings from error payloads
 * before DB / Knights context. Never store raw secrets in Help Desk.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
const BEARER_RE = /(?:Bearer|token|api[_-]?key|authorization)\s*[=:]\s*['"]?[^\s'"&,;]{8,}/gi
const SECRET_ASSIGN_RE =
  /(?:password|passwd|secret|apiKey|api_key|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[=:]\s*['"]?[^\s'"&,;]{4,}/gi
const HEX_TOKEN_RE = /\b[a-f0-9]{32,}\b/gi
const LONG_QUERY_RE = /(\?[^\s]{80,})/g
const PATH_QUERY_RE = /(https?:\/\/[^\s]+)\?[^\s]*/gi

export function redactSensitive(input: string | null | undefined, max = 4000): string {
  if (!input) return ''
  let s = input
  s = s.replace(EMAIL_RE, '[redacted-email]')
  s = s.replace(JWT_RE, '[redacted-jwt]')
  s = s.replace(BEARER_RE, '[redacted-token]')
  s = s.replace(SECRET_ASSIGN_RE, '[redacted-secret]')
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
