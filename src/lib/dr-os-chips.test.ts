import { describe, expect, it } from 'vitest'

/**
 * Pure helpers mirrored from status/chip scoring thresholds.
 * Integration paths hit Prisma — unit-test label rules only.
 */

function helpEvalLevel(score: number, stale: boolean): 'ok' | 'warn' | 'error' {
  if (score < 70) return 'error'
  if (score < 90 || stale) return 'warn'
  return 'ok'
}

function nightCleanerLevel(
  status: string,
  stale: boolean
): 'ok' | 'warn' | 'error' | 'unknown' {
  if (status === 'error') return 'error'
  if (status === 'warn' || stale) return 'warn'
  if (status === 'ok') return 'ok'
  return 'unknown'
}

function poolSizeFromUrl(url: string | undefined): number | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const raw = u.searchParams.get('connection_limit')
    if (!raw) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

describe('Dr. OS chip scoring', () => {
  it('HelpEval: ≥90 healthy, 70–89 warn, <70 error; stale warns', () => {
    expect(helpEvalLevel(95, false)).toBe('ok')
    expect(helpEvalLevel(85, false)).toBe('warn')
    expect(helpEvalLevel(60, false)).toBe('error')
    expect(helpEvalLevel(95, true)).toBe('warn')
  })

  it('Night Cleaner: maps overall status + stale', () => {
    expect(nightCleanerLevel('ok', false)).toBe('ok')
    expect(nightCleanerLevel('warn', false)).toBe('warn')
    expect(nightCleanerLevel('error', false)).toBe('error')
    expect(nightCleanerLevel('ok', true)).toBe('warn')
    expect(nightCleanerLevel('unknown', false)).toBe('unknown')
  })

  it('Neon poolSize parses connection_limit from DATABASE_URL', () => {
    expect(
      poolSizeFromUrl('postgresql://u:p@h/db?pgbouncer=true&connection_limit=10')
    ).toBe(10)
    expect(poolSizeFromUrl('postgresql://u:p@h/db')).toBeNull()
    expect(poolSizeFromUrl(undefined)).toBeNull()
  })
})
