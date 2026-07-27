import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redactSensitive } from '@/lib/error-redact'
import type { APIResponse } from '@/types'
import type { AuditEntry } from '@/types/dr-os'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

function redactPayloadLeaves(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated-depth]'
  if (typeof value === 'string') return redactSensitive(value, 2000)
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((v) => redactPayloadLeaves(v, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase()
      if (
        key.includes('password') ||
        key.includes('secret') ||
        key.includes('token') ||
        key.includes('authorization') ||
        key === 'apikey' ||
        key === 'api_key'
      ) {
        out[k] = '[redacted]'
        continue
      }
      out[k] = redactPayloadLeaves(v, depth + 1)
    }
    return out
  }
  return String(value)
}

function normalizePayload(raw: Prisma.JsonValue | null): unknown {
  if (raw == null) return null
  // Legacy rows may store stringified JSON
  if (typeof raw === 'string') {
    try {
      return redactPayloadLeaves(JSON.parse(raw) as unknown)
    } catch {
      return redactSensitive(raw, 2000)
    }
  }
  return redactPayloadLeaves(raw)
}

// Last 50 audit-log entries (CLAUDE.md §10.3) — includes redacted payload for expand UI.
export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const rows = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const data: AuditEntry[] = rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      entityId: r.entityId,
      createdAt: r.createdAt.toISOString(),
      payload: normalizePayload(r.payload),
    }))
    const body: APIResponse<AuditEntry[]> = {
      success: true,
      data,
      meta: { lastUpdated: new Date().toISOString() },
    }
    return Response.json(body)
  } catch (error) {
    const body: APIResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Audit query failed',
    }
    return Response.json(body, { status: 500 })
  }
}
