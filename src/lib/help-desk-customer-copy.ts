/**
 * Strip internal operator / knight framing before any customer-facing send.
 * Knights are prompted for William; auto-approve and Approve & send must never
 * leak that framing to the pilot Help Desk thread.
 */

const DRAFT_PREFIX_PATTERNS = [
  /^draft\s+(?:reply|answer|response)\s+(?:for\s+)?(?:william(?:\s+morrison)?\s*)?(?:(?:to|for)\s+review\s*:?\s*(?:---+[\s\n]*)?)/i,
  /^draft\s+(?:reply|answer|response)\s+for\s+william(?:\s+morrison)?\s*:\s*(?:---+[\s\n]*)?/i,
]

const LEADING_SEPARATORS = /^---+[\s\n]*/g

const OPERATOR_LEAD =
  /^(?:(?:for\s+william(?:\s+morrison)?|operator\s+note|internal\s+note|admin\s+note)\s*:+\s*)+/i

/** Trailing [English operator summary] from multilingual drafts. */
const TRAILING_BRACKET_NOTE = /\n*\[[^\]]{3,320}\]\s*$/s

const TRAILING_OPERATOR_BLOCK =
  /\n+(?:Operator note|For William(?: only)?|Internal note|Admin note)\s*:[^\n]*(?:\n(?![A-Z\u0600-\u9FFF])[^\n]*)*$/i

function stripDraftPrefixes(text: string): string {
  let out = text
  let changed = true
  while (changed) {
    changed = false
    for (const pattern of DRAFT_PREFIX_PATTERNS) {
      const next = out.replace(pattern, '')
      if (next !== out) {
        out = next
        changed = true
      }
    }
  }
  return out
}

/**
 * Returns customer-safe reply text. Empty string if nothing remains after strip.
 */
export function sanitizeCustomerFacingAnswer(raw: string): string {
  let text = raw.trim()
  if (!text) return text

  text = stripDraftPrefixes(text)
  text = text.replace(LEADING_SEPARATORS, '')
  text = text.replace(OPERATOR_LEAD, '')
  text = text.replace(TRAILING_BRACKET_NOTE, '')
  text = text.replace(TRAILING_OPERATOR_BLOCK, '')

  return text.trim()
}

/** True when sanitization would change the outbound body. */
export function customerAnswerNeedsSanitize(raw: string): boolean {
  const cleaned = sanitizeCustomerFacingAnswer(raw)
  return cleaned !== raw.trim()
}
