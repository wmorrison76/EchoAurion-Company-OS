import { z } from 'zod'

/**
 * Aurion Knowledge Plane ingest — allowlisted anonymized schemas only.
 * See docs/AURION_KNOWLEDGE_PLANE.md and docs/RELAY_CONTRACTS.md.
 */

export const FORBIDDEN_PII_KEYS = [
  'email',
  'phone',
  'phonenumber',
  'mobile',
  'guestname',
  'guest_name',
  'firstname',
  'lastname',
  'fullname',
  'ssn',
  'loyaltyid',
  'loyalty_id',
  'memberid',
  'roomnumber',
  'room_number',
  'folio',
  'folioid',
  'reservationid',
  'reservation_id',
  'creditcard',
  'cardnumber',
  'pan',
  'cvv',
  'address',
  'street',
  'dob',
  'dateofbirth',
  'date_of_birth',
  'passport',
  'driverslicense',
  'ipaddress',
  'ip_address',
] as const

const SIGNAL_TYPES = [
  'ops_pattern',
  'menu_hotspot',
  'buying_pattern',
  'system_health',
  'knowledge_meta',
] as const

const AGG_LEVELS = ['property', 'territory', 'network'] as const

export const knowledgeIngestSchema = z.object({
  clientKey: z.string().min(1).max(200),
  schemaVersion: z.string().max(20).default('1'),
  signalType: z.enum(SIGNAL_TYPES),
  territoryCode: z.string().max(40).optional(),
  aggregationLevel: z.enum(AGG_LEVELS).default('property'),
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
  payload: z.record(z.unknown()),
  sampleSize: z.number().int().nonnegative().optional(),
  confidence: z.number().min(0).max(1).optional(),
})

export type KnowledgeIngestInput = z.infer<typeof knowledgeIngestSchema>

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9_]/g, '')
}

/** Walk object keys; return first forbidden PII-like key found. */
export function findForbiddenPiiKey(value: unknown, path = ''): string | null {
  if (value == null) return null
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenPiiKey(value[i], `${path}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const nk = normalizeKey(k)
      if ((FORBIDDEN_PII_KEYS as readonly string[]).includes(nk)) {
        return path ? `${path}.${k}` : k
      }
      const hit = findForbiddenPiiKey(v, path ? `${path}.${k}` : k)
      if (hit) return hit
    }
  }
  return null
}

export function knowledgeIngestAuthorized(req: Request): {
  ok: true
} | { ok: false; status: number; error: string } {
  const secret =
    process.env.KNOWLEDGE_INGEST_SECRET?.trim() ||
    process.env.SUPPORT_INGEST_SECRET?.trim()
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: 'Knowledge ingest not configured (set KNOWLEDGE_INGEST_SECRET)',
    }
  }
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match || match[1] !== secret) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  return { ok: true }
}
