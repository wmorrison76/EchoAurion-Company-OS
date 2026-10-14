import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    supportClient: { findUnique: vi.fn() },
    incumbentSchemaObservation: { upsert: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
    aiUsageEvent: { findMany: vi.fn() },
    workRequest: { findMany: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { POST, GET } from './route'
import { POST as costPreview } from '../gap-rd-cost-preview/route'

const mockDb = db as any
const tx = {
  $queryRaw: vi.fn(),
  helpTicket: { findFirst: vi.fn(), create: vi.fn() },
  workRequest: { create: vi.fn() },
}

function request(path: string, data: unknown) {
  return new Request('http://localhost' + path, { method: 'POST', body: JSON.stringify(data) })
}
const payload = {
  clientKey: 'registered-install',
  providerKey: 'mews',
  facilityKey: 'facility-001',
  apiVersion: '2026-10',
  adapterVersion: 'gitabc123',
  fields: [{ path: 'reservation.id', kind: 'string' as const },
    { path: 'reservation.extra', kind: 'number' as const }],
  mappedPaths: ['reservation.id'],
}

beforeEach(() => {
  vi.resetAllMocks()
  ;(auth as any).mockResolvedValue({ user: { id: 'william_morrison', role: 'dr_os' } })
  ;(audit as any).mockResolvedValue(undefined)
  mockDb.supportClient.findUnique.mockResolvedValue({ id: 'registered-client' })
  mockDb.incumbentSchemaObservation.upsert.mockResolvedValue({ id: 'obs1' })
  mockDb.incumbentSchemaObservation.findMany.mockResolvedValue([])
  mockDb.incumbentSchemaObservation.findFirst.mockResolvedValue(null)
  mockDb.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
  tx.$queryRaw.mockResolvedValue([])
  tx.helpTicket.findFirst.mockResolvedValue(null)
  tx.workRequest.create.mockResolvedValue({ id: 'work-1' })
  tx.helpTicket.create.mockResolvedValue({ id: 'ticket-1' })
})

describe('DrOS incumbent schema intake (mocked DB; not live MEWS)', () => {
  it('rejects requests without an authenticated operator', async () => {
    ;(auth as any).mockResolvedValue(null)
    const res = await POST(request('/api/dr-os/incumbent-gaps', payload))
    expect(res.status).toBe(401)
    expect(mockDb.incumbentSchemaObservation.upsert).not.toHaveBeenCalled()
  })

  it('rejects unknown tenant/install IDs before persisting', async () => {
    mockDb.supportClient.findUnique.mockResolvedValue(null)
    const res = await POST(request('/api/dr-os/incumbent-gaps', payload))
    expect(res.status).toBe(404)
    expect(mockDb.incumbentSchemaObservation.upsert).not.toHaveBeenCalled()
  })

  it('compares against persisted provider/facility history, not an injected baseline', async () => {
    mockDb.incumbentSchemaObservation.findFirst.mockResolvedValue({
      fieldDescriptors: [
        { path: 'reservation.id', kind: 'string' },
        { path: 'reservation.discontinued', kind: 'boolean' },
      ],
    })
    const res = await POST(request('/api/dr-os/incumbent-gaps', payload))
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.data.report.removed).toEqual([
      { path: 'reservation.discontinued', kind: 'boolean' },
    ])
    expect(result.data.report.status).toBe('BREAKING_REVIEW')
    expect(mockDb.incumbentSchemaObservation.findFirst).toHaveBeenCalledWith({
      where: {
        clientKey: 'registered-install',
        providerKey: 'mews',
        facilityKey: 'facility-001',
      },
      orderBy: { lastObservedAt: 'desc' },
      select: { fieldDescriptors: true },
    })
    expect(tx.helpTicket.create.mock.calls[0][0].data.priority).toBe('HIGH')
  })

  it('rejects caller-supplied previous schemas that could conceal breaking changes', async () => {
    const forged = await POST(request('/api/dr-os/incumbent-gaps', {
      ...payload, previousFields: [...payload.fields],
    }))
    expect(forged.status).toBe(400)
    expect(mockDb.incumbentSchemaObservation.findFirst).not.toHaveBeenCalled()
    expect(tx.workRequest.create).not.toHaveBeenCalled()
  })

  it('fails closed when historical schema metadata is corrupted', async () => {
    mockDb.incumbentSchemaObservation.findFirst.mockResolvedValue({
      fieldDescriptors: [{ path: 'reservation.id', kind: 'not-a-field-kind' }],
    })
    const res = await POST(request('/api/dr-os/incumbent-gaps', payload))
    expect(res.status).toBe(503)
    expect(mockDb.incumbentSchemaObservation.upsert).not.toHaveBeenCalled()
    expect(tx.helpTicket.create).not.toHaveBeenCalled()
  })

  it('creates versioned metadata passport and a linked internal gap work item', async () => {
    const res = await POST(request('/api/dr-os/incumbent-gaps', payload))
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.data.report.status).toBe('MAPPING_REVIEW')
    expect(result.data.created).toBe(true)
    expect(mockDb.incumbentSchemaObservation.upsert).toHaveBeenCalledOnce()
    expect(tx.workRequest.create).toHaveBeenCalledOnce()
    const work = tx.workRequest.create.mock.calls[0][0].data
    expect(work.kind).toBe('FIX')
    expect(work.context.rAndD.costClassification).toBe('INTERNAL_RD')
    expect(work.context.rAndD.glPostingAuthorized).toBe(false)
    expect(work.context.sourceVerified).toBe(false)
    expect(tx.helpTicket.create.mock.calls[0][0].data.channel).toBe('SYSTEM')
  })

  it('does not duplicate existing same-fingerprint gap tickets', async () => {
    tx.helpTicket.findFirst.mockResolvedValue({ id: 'existing', workRequestId: 'work-1' })
    const res = await POST(request('/api/dr-os/incumbent-gaps', payload))
    const result = await res.json()
    expect(result.data.created).toBe(false)
    expect(result.data.ticketId).toBe('existing')
    expect(tx.workRequest.create).not.toHaveBeenCalled()
  })

  it('rejects raw response samples and does not create R&D tickets for fully mapped fields', async () => {
    const withRaw = { ...payload, rawResponse: { guestEmail: 'secret@example.com' } }
    const rejected = await POST(request('/api/dr-os/incumbent-gaps', withRaw))
    expect(rejected.status).toBe(400)
    const clean = await POST(request('/api/dr-os/incumbent-gaps', {
      ...payload, mappedPaths: ['reservation.id', 'reservation.extra'],
    }))
    expect(clean.status).toBe(200)
    expect((await clean.json()).data.created).toBe(false)
    expect(tx.workRequest.create).not.toHaveBeenCalled()
  })

  it('exposes version metadata without field values in an owner-only read', async () => {
    mockDb.incumbentSchemaObservation.findMany.mockResolvedValue([{
      id: 'obs-1', schemaHash: 'hash', fieldCount: 2, firstObservedAt: new Date('2026-10-09'),
    }])
    const res = await GET(new Request('http://localhost/api/dr-os/incumbent-gaps?clientKey=registered-install&providerKey=mews'))
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.data.observations).toHaveLength(1)
    expect(result.data.note).toMatch(/does not imply/)
  })
})

describe('per-gap AI R&D preview (mocked metering; no GL posting)', () => {
  const cost = {
    usageIds: ['u1'],
    shares: [{ usageId: 'u1', workRequestId: 'work-1', basisPoints: 10000 }],
    glAccount: null,
  }

  it('allocates only real internal AI usage to verified internal R&D work', async () => {
    mockDb.aiUsageEvent.findMany.mockResolvedValue([{
      id: 'u1', clientKey: null, provider: 'openai', model: 'test',
      costUsd: 0.50, estimated: false,
    }])
    mockDb.workRequest.findMany.mockResolvedValue([{
      id: 'work-1', context: { rAndD: { costClassification: 'INTERNAL_RD' } },
    }])
    const res = await costPreview(request('/api/dr-os/gap-rd-cost-preview', cost))
    expect(res.status).toBe(200)
    const output = (await res.json()).data
    expect(output.costsByGapCents['work-1']).toBe(50)
    expect(output.glStatus).toBe('NEEDS_GL_ACCOUNT')
    expect(output.posted).toBe(false)
  })

  it('never reclassifies tenant/customer inference fees as internal R&D', async () => {
    mockDb.aiUsageEvent.findMany.mockResolvedValue([{
      id: 'u1', clientKey: 'customer', provider: 'openai', model: 'test',
      costUsd: 0.50, estimated: false,
    }])
    mockDb.workRequest.findMany.mockResolvedValue([{
      id: 'work-1', context: { rAndD: { costClassification: 'INTERNAL_RD' } },
    }])
    const res = await costPreview(request('/api/dr-os/gap-rd-cost-preview', cost))
    expect(res.status).toBe(403)
  })
})
