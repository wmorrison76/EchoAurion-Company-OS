import { describe, expect, it } from 'vitest'
import { runStubFileScanMole, runUxConsistencyMole } from './desk-moles/run'
import { scanCompanyOsSrc, stubScanSummaryLabel } from './stub-scanner'

describe('stub-scanner', () => {
  it('walks src/ and no longer reports a Gmail TODO(claude) hook', () => {
    const scan = scanCompanyOsSrc()
    expect(scan.skipped).toBe(false)
    expect(scan.filesScanned).toBeGreaterThan(10)
    const gmail = scan.hits.find(
      (h) => h.path.includes('crm/outreach') && h.rule === 'todo_claude'
    )
    expect(gmail).toBeUndefined()
  })

  it('lists known scaffolds with paths (IVR / Railway / AurionIndex)', () => {
    const scan = scanCompanyOsSrc()
    const paths = scan.hits.map((h) => h.path)
    expect(paths.some((p) => p.includes('support-ivr'))).toBe(true)
    expect(paths.some((p) => p.includes('railway'))).toBe(true)
    expect(paths.some((p) => p.includes('aurion-index'))).toBe(true)
  })

  it('does not hardcode a Coming Soon clean bill in the UX mole', () => {
    const ux = runUxConsistencyMole()
    expect(ux.some((f) => /No .Coming Soon. strings/i.test(f.label))).toBe(false)
  })

  it('file-scan mole uses the walk — skipped is never “clean”', () => {
    const scan = scanCompanyOsSrc()
    const moles = runStubFileScanMole(scan)
    expect(moles.length).toBeGreaterThan(0)
    if (scan.counts.coming_soon === 0) {
      expect(moles.some((f) => /0 Coming Soon hits/.test(f.label))).toBe(true)
    } else {
      expect(moles.some((f) => f.status === 'error' && /Coming Soon/.test(f.label))).toBe(
        true
      )
    }
    expect(scan.hits.every((h) => h.path.length > 0)).toBe(true)
    expect(stubScanSummaryLabel(scan)).toMatch(/File scan|Scanner skipped/)
  })
})
