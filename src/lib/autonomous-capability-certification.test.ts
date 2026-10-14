import { describe, expect, it } from 'vitest'
import {
  evaluateAutonomousCertificationReview,
  type AutonomyEvidenceKind,
  type AutonomyReceipt,
  type AutonomyReviewInput,
} from './autonomous-capability-certification'

const kinds: AutonomyEvidenceKind[] = [
  'provider_auth', 'canonical_property_binding', 'real_schema_discovery',
  'unknown_field_handled', 'gap_to_work_request', 'independent_native_output',
  'shadow_comparison', 'vendor_disconnected_rehearsal', 'tenant_isolation',
  'rollback', 'release_policy', 'package_integrity', 'cost_traceability',
]
function receipts(): AutonomyReceipt[] {
  return kinds.map(kind => ({
    kind,
    reference: 'ci/run-123',
    passed: true,
    source: kind === 'provider_auth' ||
      kind === 'canonical_property_binding' ||
      kind === 'real_schema_discovery'
      ? 'REAL_PROVIDER'
      : kind === 'vendor_disconnected_rehearsal' ? 'TEST_HARNESS' : 'REVIEWED_ARTIFACT',
  }))
}
function eligible(): AutonomyReviewInput {
  return {
    scope: {
      providerKey: 'mews', facilityKey: 'facility-1',
      capabilityKey: 'pickup', adapterRevision: 'git.abc123',
    },
    receipts: receipts(),
    unresolvedCriticalDependencies: 0,
    approvedForIndependentReview: true,
  }
}

describe('bounded certified-autonomous readiness', () => {
  it('never certifies or installs simply because the required receipts are present', () => {
    const result = evaluateAutonomousCertificationReview(eligible())
    expect(result.missing).toEqual([])
    expect(result.rejected).toEqual([])
    expect(result.eligibleForCertificationReview).toBe(true)
    expect(result.certified).toBe(false)
    expect(result.automaticProductionInstallation).toBe(false)
  })

  it('fails closed for all-mock provider integration evidence', () => {
    const input = eligible()
    input.receipts = input.receipts.map(r => r.kind === 'provider_auth'
      ? { ...r, source: 'TEST_HARNESS' } : r)
    const result = evaluateAutonomousCertificationReview(input)
    expect(result.rejected).toContain('REAL_PROVIDER_EVIDENCE_REQUIRED:provider_auth')
    expect(result.eligibleForCertificationReview).toBe(false)
  })

  it('requires executable vendor-off proof rather than a paper review', () => {
    const input = eligible()
    input.receipts = input.receipts.map(r => r.kind === 'vendor_disconnected_rehearsal'
      ? { ...r, source: 'REVIEWED_ARTIFACT' } : r)
    expect(evaluateAutonomousCertificationReview(input).rejected)
      .toContain('EXECUTABLE_VENDOR_OFF_REHEARSAL_REQUIRED')
  })

  it('rejects unresolved dependencies and missing review approval', () => {
    const input = eligible()
    input.unresolvedCriticalDependencies = 1
    input.approvedForIndependentReview = false
    const r = evaluateAutonomousCertificationReview(input)
    expect(r.rejected).toContain('UNRESOLVED_CRITICAL_DEPENDENCIES')
    expect(r.rejected).toContain('HUMAN_REVIEW_NOT_AUTHORIZED')
    expect(r.eligibleForCertificationReview).toBe(false)
  })

  it('cannot grant readiness with one missing gate or failed receipt', () => {
    const input = eligible()
    input.receipts = input.receipts.filter(r => r.kind !== 'cost_traceability')
      .map(r => r.kind === 'rollback' ? { ...r, passed: false } : r)
    const result = evaluateAutonomousCertificationReview(input)
    expect(result.missing).toContain('cost_traceability')
    expect(result.rejected).toContain('FAILED:rollback')
  })

  it('rejects malformed/duplicated receipts and invalid scope', () => {
    const input = eligible()
    input.scope.adapterRevision = 'https://example.com?token=secret'
    input.receipts = [...input.receipts, input.receipts[0]]
    const r = evaluateAutonomousCertificationReview(input)
    expect(r.rejected).toContain('MALFORMED_OR_DUPLICATE_RECEIPT')
    expect(r.rejected).toContain('INVALID_SCOPE:adapterRevision')
  })
})
