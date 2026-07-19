/**
 * Simple greeting / presence pings — auto-reply eligible (TECH/OTHER TEXT only).
 * BUILD / BILLING never use this path.
 */

const GREETING_EXACT = new Set([
  'hi',
  'hello',
  'hey',
  'hi there',
  'hello there',
  'hey there',
  'how are you',
  'how are you doing',
  'hi how are you',
  'hi how are you doing',
  'hello how are you',
  'are you active',
  'are you there',
  'you there',
  'anyone there',
  'good morning',
  'good afternoon',
  'good evening',
])

/** Short friendly reply for presence / greeting pings. */
export const GREETING_AUTO_REPLY =
  "Hi — yes, we're active and watching. Echo Help Desk is here; how can we help your property today?"

/**
 * True when text is a short greeting / "are you active" ping (not a tech ask).
 */
export function isSimpleGreeting(text: string | null | undefined): boolean {
  if (!text) return false
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[!?.,…]+/g, ' ')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized || normalized.length > 80) return false
  if (GREETING_EXACT.has(normalized)) return true
  const words = normalized.split(' ')
  if (words.length > 8) return false
  if (/^(hi|hello|hey)\b/.test(normalized) && /\b(how are you|are you (active|there))\b/.test(normalized)) {
    return true
  }
  if (/^are you (active|there|online|awake)\b/.test(normalized)) return true
  return false
}
