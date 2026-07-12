/**
 * Core-path / hallucination guard — protects Company OS from agent self-harm.
 *
 * Knights/Architect may draft, but any proposal touching deny-list paths
 * forces AWAITING_HUMAN + NEEDS_HUMAN_CORE_REVIEW. Never auto-execute
 * schema drops, secret rotation, or middleware auth removal.
 */

export const CORE_PATH_DENY_LIST: RegExp[] = [
  /(?:^|\/)src\/lib\/auth(?:\.ts)?$/i,
  /(?:^|\/)middleware(?:\.ts)?$/i,
  /(?:^|\/)src\/lib\/relay-auth(?:\.ts)?$/i,
  /(?:^|\/)src\/lib\/constitution(?:\.ts)?$/i,
  /(?:^|\/)\.env(?:\.local|\.example)?$/i,
  /(?:^|\/)render\.yaml$/i,
  /secrets?manager/i,
  /SUPPORT_INGEST_SECRET|NEXTAUTH_SECRET|ADMIN_PASSWORD|CRON_SECRET|STRIPE_SECRET|PLAID_SECRET|MERCURY_API/i,
  /prisma\/migrations/i,
  /DROP\s+(TABLE|SCHEMA|DATABASE)/i,
  /migrate\s+reset/i,
  /db\s+push\s+--force-reset/i,
  /force.?push|git\s+push\s+--force/i,
  /deleteProtection:\s*false/i,
  /remove\s+(?:the\s+)?auth(?:entication)?\s+middleware/i,
  /disable\s+(?:auth|middleware|nextauth)/i,
  /bypass\s+(?:auth|middleware|session)/i,
]

/** Soft signals that still need dual control even if not hard deny. */
export const CORE_PATH_WARN_LIST: RegExp[] = [
  /(?:^|\/)src\/lib\/safe-tools/i,
  /(?:^|\/)src\/lib\/autonomy/i,
  /(?:^|\/)src\/app\/api\/auth/i,
  /(?:^|\/)src\/app\/api\/relay/i,
  /billing|quoteTotal|authorize/i,
]

export type CoreGuardVerdict = {
  blocked: boolean
  needsHumanCoreReview: boolean
  flag: 'NEEDS_HUMAN_CORE_REVIEW' | null
  matched: string[]
  reason: string
}

/**
 * Scan Architect/Knights plan text + file touch list for core-path contact.
 */
export function guardCorePaths(input: {
  planText?: string | null
  fileTouchList?: string[]
  subject?: string | null
}): CoreGuardVerdict {
  const blobs = [
    input.planText ?? '',
    input.subject ?? '',
    ...(input.fileTouchList ?? []),
  ]
  const matched: string[] = []

  for (const blob of blobs) {
    for (const re of CORE_PATH_DENY_LIST) {
      if (re.test(blob)) {
        matched.push(re.source)
      }
    }
  }

  if (matched.length > 0) {
    return {
      blocked: true,
      needsHumanCoreReview: true,
      flag: 'NEEDS_HUMAN_CORE_REVIEW',
      matched: [...new Set(matched)].slice(0, 12),
      reason:
        'Architect proposal touches deny-list core paths (auth, middleware, relay secrets, destructive migrate). Forced AWAITING_HUMAN — dual control required. No auto-merge.',
    }
  }

  const warns: string[] = []
  for (const blob of blobs) {
    for (const re of CORE_PATH_WARN_LIST) {
      if (re.test(blob)) warns.push(re.source)
    }
  }
  if (warns.length > 0) {
    return {
      blocked: false,
      needsHumanCoreReview: true,
      flag: 'NEEDS_HUMAN_CORE_REVIEW',
      matched: [...new Set(warns)].slice(0, 12),
      reason:
        'Proposal touches sensitive relay/billing/autonomy surfaces — flag NEEDS_HUMAN_CORE_REVIEW; draft PR only.',
    }
  }

  return {
    blocked: false,
    needsHumanCoreReview: false,
    flag: null,
    matched: [],
    reason: 'No core-path deny signals',
  }
}
