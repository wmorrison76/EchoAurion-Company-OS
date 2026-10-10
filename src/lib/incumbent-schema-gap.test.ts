import { describe, expect, it } from 'vitest'
import { analyzeIncumbentSchema, type SchemaObservation } from './incumbent-schema-gap'

const base: SchemaObservation = {
  providerKey: 'mews',
  facilityKey: 'facility-test-01',
  apiVersion: '2026-10',
  adapterVersion: 'git:dafe1234',
  fields: [
    { path: 'reservation.id', kind: 'string' },
    { path: 'reservation.total', kind: 'number' },
    { path: 'reservation.newCategory', kind: 'string' },
  ],
  mappedPaths: ['reservation.id', 'reservation.total'],
}

describe('incumbent schema gaps', () => {
  it('classifies unknown fields as review-required, not installed or certified', () => {
    const report = analyzeIncumbentSchema(base)
    expect(report.status).toBe('MAPPING_REVIEW')
    expect(report.unmapped).toEqual([{ path: 'reservation.newCategory', kind: 'string' }])
    expect(report.continuityCertified).toBe(false)
    expect(report.sourceVerified).toBe(false)
  })

  it('detects removals and changed types, prioritizing breaking review', () => {
    const report = analyzeIncumbentSchema({
      ...base,
      previousFields: [
        { path: 'reservation.id', kind: 'string' },
        { path: 'reservation.total', kind: 'string' },
        { path: 'reservation.discontinued', kind: 'boolean' },
      ],
      mappedPaths: [...base.mappedPaths, 'reservation.newCategory'],
      criticalPaths: ['reservation.discontinued', 'reservation.total'],
    })
    expect(report.status).toBe('BREAKING_REVIEW')
    expect(report.removed.map(f => f.path)).toEqual(['reservation.discontinued'])
    expect(report.typeChanged).toEqual([
      { path: 'reservation.total', before: 'string', after: 'number' },
    ])
    expect(report.criticalGaps).toEqual(['reservation.discontinued', 'reservation.total'])
  })

  it('is deterministic across field ordering but changes fingerprint on drift', () => {
    const a = analyzeIncumbentSchema(base)
    const b = analyzeIncumbentSchema({
      ...base,
      fields: [...base.fields].reverse(),
      mappedPaths: [...base.mappedPaths].reverse(),
    })
    expect(a.schemaHash).toBe(b.schemaHash)
    expect(a.fingerprint).toBe(b.fingerprint)
    expect(analyzeIncumbentSchema({ ...base, apiVersion: 'new' }).fingerprint).not.toBe(a.fingerprint)
  })

  it('says no gap only when every path is explicitly mapped', () => {
    const report = analyzeIncumbentSchema({
      ...base, mappedPaths: base.fields.map(f => f.path),
    })
    expect(report.status).toBe('NO_GAP')
  })

  it('rejects duplicate and malformed field descriptors', () => {
    expect(() => analyzeIncumbentSchema({
      ...base, fields: [...base.fields, base.fields[0]],
    })).toThrow('OBSERVATION_INVALID_OR_DUPLICATE')
    expect(() => analyzeIncumbentSchema({
      ...base, fields: [{ path: 'alice@example.com', kind: 'string' }],
    })).toThrow('OBSERVATION_INVALID_OR_DUPLICATE')
    expect(() => analyzeIncumbentSchema({
      ...base, fields: [],
    })).toThrow('OBSERVATION_EMPTY')
  })

  it('never treats unknown field values or computed metrics as functional continuity', () => {
    const result = analyzeIncumbentSchema(base)
    expect(Object.keys(result)).not.toContain('rawValues')
    expect(Object.keys(result)).not.toContain('employeeRecords')
    expect(result.continuityCertified).toBe(false)
  })
})
