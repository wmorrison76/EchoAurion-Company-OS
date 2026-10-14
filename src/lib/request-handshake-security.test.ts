import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { requestNonce: { create: vi.fn(), deleteMany: vi.fn() } },
}))
vi.mock('@/lib/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }))

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { buildHandshakeHeaders, verifyRequestHandshake } from './request-handshake'

const create = vi.mocked(db.requestNonce.create)
const log = vi.mocked(audit)

function attempt(required = true) {
  const headers = buildHandshakeHeaders({
    clientKey: 'property-test-a',
    nonce: 'fixture-nonce-12345678',
    rawBody: '{"metadata":true}',
  })
  return verifyRequestHandshake({
    req: new Request('https://example.test/api/relay', { method: 'POST', headers }),
    route: '/api/relay/test',
    clientKey: 'property-test-a',
    rawBody: '{"metadata":true}',
    required,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  create.mockResolvedValue({} as never)
  log.mockResolvedValue(undefined)
})

describe('Company OS distributed nonce replay defense', () => {
  it('accepts a properly bound request only after durable atomic nonce storage', async () => {
    const result = await attempt(true)
    expect(result).toEqual({ ok: true, enforced: true, soft: false })
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0].data).toMatchObject({
      clientKey: 'property-test-a',
      nonce: 'fixture-nonce-12345678',
      route: '/api/relay/test',
    })
  })

  it('returns 409 on an atomically rejected duplicate nonce', async () => {
    create.mockRejectedValue(new Error('Unique constraint failed (P2002)'))
    const result = await attempt(true)
    expect(result).toMatchObject({ ok: false, status: 409, code: 'REPLAY_REJECTED' })
  })

  it('fails closed with 503 when the nonce table is unavailable', async () => {
    create.mockRejectedValue(new Error('database connection refused'))
    const result = await attempt(true)
    expect(result).toMatchObject({ ok: false, status: 503, code: 'REPLAY_STORE_UNAVAILABLE' })
    expect(result.ok).toBe(false)
    expect(create).toHaveBeenCalledOnce()
  })

  it('does not downgrade a supplied nonce in soft-mode when persistence fails', async () => {
    create.mockRejectedValue(new Error('RequestNonce table does not exist'))
    const result = await attempt(false)
    expect(result).toMatchObject({ ok: false, status: 503, code: 'REPLAY_STORE_UNAVAILABLE' })
  })

  it('rejects tenant mismatch before persisting nonce', async () => {
    const headers = buildHandshakeHeaders({ clientKey: 'property-test-b', nonce: 'nonce-mismatch-test' })
    const result = await verifyRequestHandshake({
      req: new Request('https://example.test/relay', { method: 'POST', headers }),
      route: '/api/relay/test',
      clientKey: 'property-test-a',
      required: true,
    })
    expect(result).toMatchObject({ ok: false, status: 403, code: 'HANDSHAKE_CLIENT_MISMATCH' })
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects missing required handshake headers before persistence', async () => {
    const result = await verifyRequestHandshake({
      req: new Request('https://example.test/relay'),
      route: '/api/relay/test',
      clientKey: 'property-test-a',
      required: true,
    })
    expect(result).toMatchObject({ ok: false, status: 401, code: 'HANDSHAKE_REQUIRED' })
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects altered payload hashes before persisting any nonce', async () => {
    const headers = buildHandshakeHeaders({
      clientKey: 'property-test-a', rawBody: 'before', nonce: 'bound-nonce-123',
    })
    const result = await verifyRequestHandshake({
      req: new Request('https://example.test/relay', { method: 'POST', headers }),
      route: '/api/relay/test',
      clientKey: 'property-test-a',
      rawBody: 'after',
      required: true,
    })
    expect(result).toMatchObject({ ok: false, status: 401, code: 'HANDSHAKE_HASH_MISMATCH' })
    expect(create).not.toHaveBeenCalled()
  })
  it('does not expand timestamp freshness beyond five minutes through configuration', async () => {
    const previous = process.env.RELAY_HANDSHAKE_SKEW_MS
    process.env.RELAY_HANDSHAKE_SKEW_MS = String(24 * 60 * 60 * 1000)
    try {
      const headers = buildHandshakeHeaders({
        clientKey: 'property-test-a', nonce: 'stale-nonce-12345678',
      })
      headers['X-Echo-Timestamp'] = String(Date.now() - 10 * 60 * 1000)
      const result = await verifyRequestHandshake({
        req: new Request('https://example.test/relay', { method: 'POST', headers }),
        route: '/api/relay/test',
        clientKey: 'property-test-a',
        required: true,
      })
      expect(result).toMatchObject({ ok: false, status: 401, code: 'HANDSHAKE_SKEW' })
      expect(create).not.toHaveBeenCalled()
    } finally {
      if (previous === undefined) delete process.env.RELAY_HANDSHAKE_SKEW_MS
      else process.env.RELAY_HANDSHAKE_SKEW_MS = previous
    }
  })

})
