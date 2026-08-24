import { describe, expect, it } from 'vitest'
import { computeHealth, HEALTH_LABEL, resolveHeartbeatLastSyncAt } from '@/lib/support'

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000)
}

describe('resolveHeartbeatLastSyncAt', () => {
  it('stamps ingest time when lastSyncAt is omitted', () => {
    const now = new Date('2026-08-24T03:00:00.000Z')
    expect(resolveHeartbeatLastSyncAt(undefined, now).toISOString()).toBe(now.toISOString())
    expect(resolveHeartbeatLastSyncAt(null, now).toISOString()).toBe(now.toISOString())
    expect(resolveHeartbeatLastSyncAt('', now).toISOString()).toBe(now.toISOString())
  })

  it('keeps an explicit lastSyncAt', () => {
    const now = new Date('2026-08-24T03:00:00.000Z')
    const raw = '2026-08-20T12:00:00.000Z'
    expect(resolveHeartbeatLastSyncAt(raw, now).toISOString()).toBe(raw)
  })
})

describe('computeHealth', () => {
  it('is GREEN when keep-alive stamps a recent lastSyncAt', () => {
    expect(
      computeHealth({
        online: true,
        queueDepth: 0,
        errorCount: 0,
        lastSyncAt: resolveHeartbeatLastSyncAt(undefined),
      })
    ).toBe('GREEN')
  })

  it('is RED / At risk when lastSyncAt is missing (never synced)', () => {
    expect(
      computeHealth({ online: true, queueDepth: 0, errorCount: 0, lastSyncAt: null })
    ).toBe('RED')
    expect(HEALTH_LABEL.RED).toBe('At risk')
  })

  it('is RED when lastSyncAt is older than 72h', () => {
    expect(
      computeHealth({
        online: true,
        queueDepth: 0,
        errorCount: 0,
        lastSyncAt: hoursAgo(80),
      })
    ).toBe('RED')
  })

  it('is AMBER when lastSyncAt is 24–72h old', () => {
    expect(
      computeHealth({
        online: true,
        queueDepth: 0,
        errorCount: 0,
        lastSyncAt: hoursAgo(30),
      })
    ).toBe('AMBER')
  })

  it('is RED on huge queue or error burst even with a fresh sync', () => {
    const fresh = resolveHeartbeatLastSyncAt(undefined)
    expect(
      computeHealth({ online: true, queueDepth: 51, errorCount: 0, lastSyncAt: fresh })
    ).toBe('RED')
    expect(
      computeHealth({ online: true, queueDepth: 0, errorCount: 11, lastSyncAt: fresh })
    ).toBe('RED')
  })
})
