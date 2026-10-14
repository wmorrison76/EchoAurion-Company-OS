/**
 * Certified Autonomous: independent review eligibility for ONE bounded
 * provider / facility / capability / adapter release.
 *
 * This evaluates supplied metadata receipts, not their authenticity.
 * It can NEVER issue a certificate or deploy/install software.
 * Independent verifier must check signatures, artifacts, tenancy and provider
 * data before granting certification. Simulator-only success is insufficient.
 */
export type AutonomyEvidenceKind =
  | 'provider_auth'
  | 'canonical_property_binding'
  | 'real_schema_discovery'
  | 'unknown_field_handled'
  | 'gap_to_work_request'
  | 'independent_native_output'
  | 'shadow_comparison'
  | 'vendor_disconnected_rehearsal'
  | 'tenant_isolation'
  | 'rollback'
  | 'release_policy'
  | 'package_integrity'
  | 'cost_traceability'

export type AutonomyEvidenceSource = 'REAL_PROVIDER' | 'TEST_HARNESS' | 'REVIEWED_ARTIFACT'
export interface AutonomyReceipt {
  kind: AutonomyEvidenceKind
  source: AutonomyEvidenceSource
  /** External audit evidence locator; never embed API payloads, PII or secrets. */
  reference: string
  passed: boolean
}
export interface AutonomyScope {
  providerKey: string
  facilityKey: string
  capabilityKey: string
  adapterRevision: string
}
export interface AutonomyReviewInput {
  scope: AutonomyScope
  receipts: readonly AutonomyReceipt[]
  /** Explicitly reviewed critical dependency inventory (not inferred from an LLM). */
  unresolvedCriticalDependencies: number
  /** Human review of all referenced evidence; cannot be inferred from passing tests. */
  approvedForIndependentReview: boolean
}
export interface AutonomyReviewResult {
  scope: AutonomyScope
  missing: AutonomyEvidenceKind[]
  rejected: string[]
  eligibleForCertificationReview: boolean
  /** Certification is an external approval process; this function cannot grant it. */
  certified: false
  automaticProductionInstallation: false
}

const REQUIRED: readonly AutonomyEvidenceKind[] = [
  'provider_auth',
  'canonical_property_binding',
  'real_schema_discovery',
  'unknown_field_handled',
  'gap_to_work_request',
  'independent_native_output',
  'shadow_comparison',
  'vendor_disconnected_rehearsal',
  'tenant_isolation',
  'rollback',
  'release_policy',
  'package_integrity',
  'cost_traceability',
]

const REAL_PROVIDER_REQUIRED: ReadonlySet<AutonomyEvidenceKind> = new Set([
  'provider_auth',
  'canonical_property_binding',
  'real_schema_discovery',
])

const SAFE_TOKEN = /^[A-Za-z0-9_./:@+-]{1,192}$/

export function evaluateAutonomousCertificationReview(input: AutonomyReviewInput): AutonomyReviewResult {
  const rejected: string[] = []
  const scope = input.scope
  for (const key of ['providerKey', 'facilityKey', 'capabilityKey', 'adapterRevision'] as const) {
    if (typeof scope?.[key] !== 'string' || !SAFE_TOKEN.test(scope[key])) {
      rejected.push('INVALID_SCOPE:' + key)
    }
  }
  if (!Number.isSafeInteger(input.unresolvedCriticalDependencies) ||
      input.unresolvedCriticalDependencies < 0) {
    rejected.push('INVALID_CRITICAL_DEPENDENCY_COUNT')
  } else if (input.unresolvedCriticalDependencies > 0) {
    rejected.push('UNRESOLVED_CRITICAL_DEPENDENCIES')
  }

  const receipts = new Map<AutonomyEvidenceKind, AutonomyReceipt>()
  if (!Array.isArray(input.receipts) || input.receipts.length > 50) {
    rejected.push('INVALID_RECEIPTS')
  } else {
    for (const receipt of input.receipts) {
      if (!receipt || !REQUIRED.includes(receipt.kind) || receipts.has(receipt.kind) ||
          !['REAL_PROVIDER', 'TEST_HARNESS', 'REVIEWED_ARTIFACT'].includes(receipt.source) ||
          typeof receipt.passed !== 'boolean' ||
          typeof receipt.reference !== 'string' || !SAFE_TOKEN.test(receipt.reference)) {
        rejected.push('MALFORMED_OR_DUPLICATE_RECEIPT')
        continue
      }
      receipts.set(receipt.kind, receipt)
      if (!receipt.passed) rejected.push('FAILED:' + receipt.kind)
      if (REAL_PROVIDER_REQUIRED.has(receipt.kind) && receipt.source !== 'REAL_PROVIDER') {
        rejected.push('REAL_PROVIDER_EVIDENCE_REQUIRED:' + receipt.kind)
      }
      // Vendor-off must prove live/native operations under a controlled outage
      // test; a mere static plan or documentation is insufficient.
      if (receipt.kind === 'vendor_disconnected_rehearsal' &&
          receipt.source !== 'TEST_HARNESS') {
        rejected.push('EXECUTABLE_VENDOR_OFF_REHEARSAL_REQUIRED')
      }
    }
  }
  const missing = REQUIRED.filter(kind => !receipts.has(kind))
  if (input.approvedForIndependentReview !== true) {
    rejected.push('HUMAN_REVIEW_NOT_AUTHORIZED')
  }
  return {
    scope,
    missing,
    rejected,
    eligibleForCertificationReview: missing.length === 0 && rejected.length === 0,
    certified: false,
    automaticProductionInstallation: false,
  }
}
