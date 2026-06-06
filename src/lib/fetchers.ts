import type { DrOsStatus, AuditEntry } from '@/types/dr-os'
import type { APIResponse } from '@/types'

class UnauthorizedError extends Error {}

/**
 * Reads the Dr. OS SSE status endpoint as a one-shot poll (CLAUDE.md §10.4):
 * fetch the stream, parse the single `data:` frame, return the payload.
 */
export async function statusFetcher(url: string): Promise<DrOsStatus> {
  const res = await fetch(url, { headers: { Accept: 'text/event-stream' }, cache: 'no-store' })
  if (res.status === 401) throw new UnauthorizedError('Unauthorized')
  if (!res.ok) throw new Error(`Status ${res.status}`)

  const text = await res.text()
  const line = text.split('\n').find((l) => l.startsWith('data:'))
  if (!line) throw new Error('Malformed status stream')

  const payload = JSON.parse(line.slice('data:'.length).trim()) as
    | ({ type: 'status' } & DrOsStatus)
    | { type: 'error'; error: string }

  if (payload.type === 'error') throw new Error(payload.error)
  return payload
}

export async function auditFetcher(url: string): Promise<AuditEntry[]> {
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 401) throw new UnauthorizedError('Unauthorized')
  const body = (await res.json()) as APIResponse<AuditEntry[]>
  if (!body.success) throw new Error(body.error)
  return body.data
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof UnauthorizedError
}
