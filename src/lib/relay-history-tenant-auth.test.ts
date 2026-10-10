import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { supportClient: { findUnique: vi.fn() } },
}))

import { db } from '@/lib/db'
import { authorizeRelayHistoryRead } from './relay-history-tenant-auth'

const find = vi.mocked(db.supportClient.findUnique)
const tenantA = 'property-alpha'
const tenantB = 'property-beta'
const keyA = 'A'.repeat(48)
const keyB = 'B'.repeat(48)
const sharedKey = 'S'.repeat(48)
const digest = (token: string) => createHash('sha256').update(token).digest('hex')

function req(token?: string, clientKeyHeader?: string): Request {
  const headers = new Headers()
  if (token !== undefined) headers.set('Authorization', 'Bearer ' + token)
  if (clientKeyHeader) headers.set('X-Echo-Client-Key', clientKeyHeader)
  return new Request('https://company-os.invalid/api/relay/questions', { headers })
}

beforeEach(() => {
  vi.resetAllMocks()
  find.mockImplementation((async ({ where }: { where: { clientKey: string } }) => {
    if (where.clientKey === tenantA) return { ingestSecretHash: digest(keyA) } as never
    if (where.clientKey === tenantB) return { ingestSecretHash: digest(keyB) } as never
    return null
  }) as never)
})

describe('tenant-scoped Help Desk history read credentials', () => {
  it('authorizes only a registered installation with its own secret hash', async () => {
    expect(await authorizeRelayHistoryRead({ req: req(keyA), clientKey: tenantA }))
      .toEqual({ ok: true, clientKey: tenantA })
    expect(find).toHaveBeenCalledWith({
      where: { clientKey: tenantA }, select: { ingestSecretHash: true },
    })
  })

  it('blocks installation A from reading installation B by changing clientKey', async () => {
    const result = await authorizeRelayHistoryRead({ req: req(keyA), clientKey: tenantB })
    expect(result).toMatchObject({ ok: false, status: 401 })
  })

  it('does not accept the fleet shared bearer as a history credential', async () => {
    const result = await authorizeRelayHistoryRead({ req: req(sharedKey), clientKey: tenantA })
    expect(result).toMatchObject({ ok: false, status: 401 })
  })

  it('does not fall back to shared credentials when installation is unregistered', async () => {
    const result = await authorizeRelayHistoryRead({
      req: req(sharedKey), clientKey: 'unregistered-install',
    })
    expect(result).toMatchObject({ ok: false, status: 401 })
  })

  it('rejects a missing, too-short or incorrectly formatted bearer', async () => {
    for (const token of [undefined, 'short', 'space in token', 'Z'.repeat(513)]) {
      const result = await authorizeRelayHistoryRead({ req: req(token), clientKey: tenantA })
      expect(result).toMatchObject({ ok: false, status: 401 })
    }
    expect(find).not.toHaveBeenCalled()
  })

  it('does not allow caller to override the installation declared in headers', async () => {
    const result = await authorizeRelayHistoryRead({
      req: req(keyA, tenantB), clientKey: tenantA,
    })
    expect(result).toMatchObject({ ok: false, status: 401 })
    expect(find).not.toHaveBeenCalled()
  })

  it('rejects missing per-install credential configuration and legacy cleartext', async () => {
    find.mockResolvedValueOnce({ ingestSecretHash: null } as never)
    expect(await authorizeRelayHistoryRead({ req: req(keyA), clientKey: tenantA }))
      .toMatchObject({ ok: false, status: 401 })
    find.mockResolvedValueOnce({ ingestSecretHash: keyA } as never)
    expect(await authorizeRelayHistoryRead({ req: req(keyA), clientKey: tenantA }))
      .toMatchObject({ ok: false, status: 401 })
  })

  it('fails closed when the auth database cannot be read', async () => {
    find.mockRejectedValueOnce(new Error('database unavailable'))
    expect(await authorizeRelayHistoryRead({ req: req(keyA), clientKey: tenantA }))
      .toMatchObject({ ok: false, status: 503, code: 'INSTALLATION_AUTH_UNAVAILABLE' })
  })

  it('does not accept empty or malformed installation identifiers', async () => {
    for (const clientKey of ['', '  ', 'A'.repeat(201), 'a\nb']) {
      expect(await authorizeRelayHistoryRead({ req: req(keyA), clientKey }))
        .toMatchObject({ ok: false, status: 401 })
    }
    expect(find).not.toHaveBeenCalled()
  })

  it('does not confer end-user identity or other tenant permissions through this gate', async () => {
    const result = await authorizeRelayHistoryRead({ req: req(keyA), clientKey: tenantA })
    expect(result.ok).toBe(true)
    expect(Object.keys(result)).not.toContain('userId')
    expect(Object.keys(result)).not.toContain('roles')
    expect(Object.keys(result)).not.toContain('admin')
  })
})
