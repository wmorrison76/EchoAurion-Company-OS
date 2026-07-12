/**
 * EchoAurion Company OS — Dr. OS Constitution (runtime rules).
 * Narrative: docs/CONSTITUTION.md
 *
 * Every agent / standby / tool path should call assertConstitutional or
 * checkConstitution before mutating production-affecting state.
 */

export const CONSTITUTION_VERSION = '1.1.0'

export const CONSTITUTION_RULES = [
  {
    id: 'no_pii',
    title: 'No guest PII',
    summary:
      'Never store, log, or relay guest names, emails, phone numbers, payment cards, or room numbers in Help Desk, Knowledge Plane, or outbox payloads.',
  },
  {
    id: 'no_prod_write_without_gates',
    title: 'No production write without gates',
    summary:
      'Production-affecting changes require the two-key path: quote freeze → paid-via-profile agreement → billing authorize → William execute with rollbackRef.',
  },
  {
    id: 'pr_only_code',
    title: 'PR-only code changes',
    summary:
      'Architect / Build work produces a draft PR plan (and optional draft GitHub PR). Merge is always human/CI — never autopilot. GLOBAL error fixes are draft-PR only.',
  },
  {
    id: 'audit_actors',
    title: 'Audit every mutation',
    summary:
      'Every mutating action records actor william_morrison | computer_agent, timestamp, action, entity, and payload snapshot.',
  },
  {
    id: 'dual_control_paid',
    title: 'Dual control for paid work',
    summary:
      'Paid builds need EXEC/ADMIN/DIRECTOR profile agreement plus billing-contact authorize. Super Admin (ADMIN_EMAIL) may simulate as EXEC in lab only.',
  },
  {
    id: 'rollback_required',
    title: 'Rollback required before execute',
    summary:
      'WorkRequest.execute is blocked without a rollbackRef (revert SHA / snapshot id).',
  },
  {
    id: 'no_remote_desktop',
    title: 'No remote desktop',
    summary:
      'Safe tools and break-glass never open RDP/TeamViewer. Break-glass is a scaffold for future integration only.',
  },
  {
    id: 'autopilot_limits',
    title: 'Autopilot cannot merge / paid / T3+',
    summary:
      'Autonomy dial autopilot may auto-answer low-risk TEXT and emit stub directives. It cannot merge PRs, execute paid work, or auto-approve T3+ quotes.',
  },
  {
    id: 'no_core_self_harm',
    title: 'No core self-harm / hallucination writes',
    summary:
      'Knights/Architect must NOT auto-modify Company OS core auth, billing, relay secrets, middleware, or destructive prisma. Deny-list hits force AWAITING_HUMAN + NEEDS_HUMAN_CORE_REVIEW. Dual control required. Never auto-execute schema drops / secret rotation / auth removal.',
  },
] as const

export type ConstitutionRuleId = (typeof CONSTITUTION_RULES)[number]['id']

export type ConstitutionAction =
  | 'store_payload'
  | 'auto_answer'
  | 'auto_execute_work'
  | 'merge_pr'
  | 'create_draft_pr'
  | 'invoke_tool'
  | 'remote_desktop'
  | 'quote_t3_plus'
  | 'break_glass'
  | 'modify_core'
  | 'destructive_migrate'
  | 'rotate_secrets'

export interface ConstitutionCheck {
  ok: boolean
  ruleId: ConstitutionRuleId | null
  reason: string
}

const PII_KEY =
  /\b(guest(Name|Email|Phone)|roomNumber|creditCard|ssn|passport|dateOfBirth|dob)\b/i
const PII_VALUE =
  /\b(\d{3}-\d{2}-\d{4}|\d{16}|guest@|room\s*#?\s*\d{2,4})\b/i

/** Reject payloads that look like guest PII keys/values. */
export function checkNoPii(payload: unknown): ConstitutionCheck {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})
  if (PII_KEY.test(text) || PII_VALUE.test(text)) {
    return {
      ok: false,
      ruleId: 'no_pii',
      reason: 'Payload appears to contain guest PII — blocked by constitution',
    }
  }
  return { ok: true, ruleId: null, reason: 'No PII signals detected' }
}

/**
 * Hard gates for high-risk actions. Soft warnings are returned as ok:true with reason.
 */
export function checkConstitution(
  action: ConstitutionAction,
  ctx?: {
    autonomyDial?: string
    tier?: string
    dryRun?: boolean
    planText?: string
    fileTouchList?: string[]
  }
): ConstitutionCheck {
  switch (action) {
    case 'remote_desktop':
      return {
        ok: false,
        ruleId: 'no_remote_desktop',
        reason: 'Remote desktop is constitutionally forbidden in this phase',
      }
    case 'auto_execute_work':
      return {
        ok: false,
        ruleId: 'no_prod_write_without_gates',
        reason: 'Autopilot/standby may never execute WorkRequest — dual control required',
      }
    case 'merge_pr':
      return {
        ok: false,
        ruleId: 'pr_only_code',
        reason: 'Merge is human/CI only — never agent or autopilot',
      }
    case 'modify_core':
    case 'destructive_migrate':
    case 'rotate_secrets':
      return {
        ok: false,
        ruleId: 'no_core_self_harm',
        reason:
          'Core auth/billing/relay secrets/destructive migrate/secret rotation require dual human control — agents may only draft',
      }
    case 'quote_t3_plus':
      if (ctx?.autonomyDial === 'autopilot') {
        return {
          ok: false,
          ruleId: 'autopilot_limits',
          reason: 'Autopilot cannot auto-approve T3+ quotes',
        }
      }
      return { ok: true, ruleId: null, reason: 'T3+ allowed with human dual control' }
    case 'create_draft_pr': {
      // Soft-check: if plan touches core, still allow draft but caller must flag NEEDS_HUMAN_CORE_REVIEW
      if (ctx?.planText || ctx?.fileTouchList?.length) {
        // Import deferred via dynamic pattern avoided — callers use guardCorePaths.
        return {
          ok: true,
          ruleId: 'pr_only_code',
          reason:
            'Draft PR only — merge remains human/CI. Run guardCorePaths; core hits → AWAITING_HUMAN',
        }
      }
      return {
        ok: true,
        ruleId: 'pr_only_code',
        reason: 'Draft PR only — merge remains human/CI',
      }
    }
    case 'invoke_tool':
      if (ctx?.dryRun === false && ctx?.autonomyDial === 'assist') {
        return {
          ok: false,
          ruleId: 'autopilot_limits',
          reason: 'Assist mode allows dry-run tools only — flip autonomy to standby/autopilot to execute directives',
        }
      }
      return { ok: true, ruleId: null, reason: 'Tool invoke permitted under current dial' }
    case 'auto_answer':
      return { ok: true, ruleId: null, reason: 'Auto-answer gated separately by standby eligibility' }
    case 'store_payload':
      return { ok: true, ruleId: null, reason: 'Caller must also run checkNoPii' }
    case 'break_glass':
      return {
        ok: true,
        ruleId: 'no_remote_desktop',
        reason: 'Break-glass session scaffold only — no RDP',
      }
    default:
      return { ok: true, ruleId: null, reason: 'No constitution block' }
  }
}

export function assertConstitutional(
  action: ConstitutionAction,
  ctx?: { autonomyDial?: string; tier?: string; dryRun?: boolean }
): void {
  const check = checkConstitution(action, ctx)
  if (!check.ok) {
    throw new Error(`CONSTITUTION:${check.ruleId ?? 'blocked'} — ${check.reason}`)
  }
}

export function constitutionSummary(): {
  version: string
  rules: typeof CONSTITUTION_RULES
} {
  return { version: CONSTITUTION_VERSION, rules: CONSTITUTION_RULES }
}
