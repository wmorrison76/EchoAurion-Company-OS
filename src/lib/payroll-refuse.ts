/**
 * Hard refuse for payroll / compensation questions on Help Desk.
 *
 * Knights do not see product RBAC or live payroll data. Non-admin floor staff
 * must not get salary answers via AI draft. William (Dr. OS) may still type a
 * manual reply after verifying authorization — Knights never invent figures.
 */

import { normalizePilotRole, type PilotRole } from './work-roles'

/** Matches asks for someone’s pay, wages, compensation amounts, or payroll data. */
const COMPENSATION_SIGNAL =
  /\b(how much\s+(is|are|does|do|someone|they|he|she|we)|(?:what(?:'s| is| are)?)\s+(?:my|his|her|their|someone(?:'s)?|staff|employee)\s+(?:pay|salary|wage|compensation)|salary|salaries|wage|wages|compensation|paycheck|pay\s*stub|take[- ]home|gross\s+pay|net\s+pay|hourly\s+rate|annual\s+(?:pay|salary)|(?:making|earning|paid)\s+\$?\d|(?:pays?|paid)\s+(?:how much|what)|payroll\s+(?:data|amount|number|figure|for|of)|ssn|social\s+security\s+number)\b/i

/** Broader payroll/HR fishing that still must not be answered by auto-Knights. */
const PAYROLL_SENSITIVE_SIGNAL =
  /\b(payroll|hr\s*&\s*payroll|direct\s+deposit|garnish(?:ment)?|withholding|w[- ]?2|w[- ]?4|1099\s+employee|bonus\s+amount|tip\s+out\s+amount|labor\s+cost\s+per\s+(?:person|employee|staff))\b/i

/** Benign how-to about finding a screen — not a data disclose. */
const PAYROLL_HOWTO_ONLY =
  /\b(how\s+(do|to|can)|where\s+(is|do|can)|open|find|navigate|panel|screen|module|setting)\b/i

export type PayrollRefuseReason =
  | 'compensation_data'
  | 'payroll_sensitive_non_admin'
  | 'payroll_sensitive'

export interface PayrollRefuseVerdict {
  refuse: boolean
  reason: PayrollRefuseReason | null
  matched: string
  /** Safe text William may Approve & send (no figures). */
  customerReply: string
  /** Operator-facing SYSTEM note. */
  operatorNote: string
}

const CUSTOMER_REPLY =
  'I can’t share payroll or compensation details through Help Desk. Please ask a property administrator with payroll access, or use your property’s HR/Payroll tools if your role allows. If you’re locked out of a screen, tell us which role you’re signed in as and which panel you need.'

function extractAskerRole(context: unknown): PilotRole | null {
  if (!context || typeof context !== 'object') return null
  const c = context as Record<string, unknown>
  const raw =
    (typeof c.profileRole === 'string' && c.profileRole) ||
    (typeof c.requesterRole === 'string' && c.requesterRole) ||
    (typeof c.role === 'string' && c.role) ||
    null
  return normalizePilotRole(raw)
}

function isPayrollAdmin(role: PilotRole | null): boolean {
  return role === 'ADMIN' || role === 'DIRECTOR' || role === 'EXEC'
}

/**
 * Detect payroll / compensation asks that must not get an AI draft.
 *
 * - Compensation amounts / “how much is X making” → always refuse.
 * - Broader payroll-sensitive asks → refuse unless asker role is ADMIN|DIRECTOR|EXEC
 *   (when known). Unknown role → refuse (safe default).
 * - Pure navigation how-to (“where is the payroll panel?”) without amount signals → allow.
 */
export function detectPayrollRefuse(input: {
  text: string
  subject?: string | null
  /** CustomerQuestion.context or similar — may include profileRole. */
  context?: unknown
  /**
   * When true (William manually Ask Knights from Company OS), still refuse
   * inventing figures but operator note clarifies he may reply manually.
   */
  operatorOverride?: boolean
}): PayrollRefuseVerdict {
  const blob = [input.subject, input.text].filter(Boolean).join('\n')
  const role = extractAskerRole(input.context)

  if (COMPENSATION_SIGNAL.test(blob)) {
    const match = blob.match(COMPENSATION_SIGNAL)?.[0] ?? 'compensation'
    return {
      refuse: true,
      reason: 'compensation_data',
      matched: match,
      customerReply: CUSTOMER_REPLY,
      operatorNote: [
        'PAYROLL_REFUSED — compensation / salary ask. Knights skipped (no product RBAC or payroll DB access).',
        `Asker role in context: ${role ?? 'unknown'}.`,
        input.operatorOverride
          ? 'William (Dr. OS) may type a manual reply after verifying the asker is authorized in-product — never invent dollar amounts.'
          : 'Do not Approve & send anything that discloses pay. Escalate to property HR/admin, or reply with the safe refuse text.',
        `Matched: ${match}`,
      ].join(' '),
    }
  }

  if (PAYROLL_SENSITIVE_SIGNAL.test(blob)) {
    const howtoOnly =
      PAYROLL_HOWTO_ONLY.test(blob) &&
      !/\b(amount|total|\$|figure|number|ssn|deposit\s+account)\b/i.test(blob)
    if (howtoOnly) {
      return {
        refuse: false,
        reason: null,
        matched: '',
        customerReply: '',
        operatorNote: '',
      }
    }

    const match = blob.match(PAYROLL_SENSITIVE_SIGNAL)?.[0] ?? 'payroll'
    if (isPayrollAdmin(role)) {
      // Admin-class asker: still no inventing data — refuse AI draft; operator handles.
      return {
        refuse: true,
        reason: 'payroll_sensitive',
        matched: match,
        customerReply: CUSTOMER_REPLY,
        operatorNote: [
          'PAYROLL_REFUSED — payroll-sensitive topic. Knights do not query live payroll.',
          `Asker role maps to ${role} (admin-class) — William may guide them in-product after verifying access; do not invent figures.`,
          `Matched: ${match}`,
        ].join(' '),
      }
    }

    return {
      refuse: true,
      reason: 'payroll_sensitive_non_admin',
      matched: match,
      customerReply: CUSTOMER_REPLY,
      operatorNote: [
        'PAYROLL_REFUSED — payroll/HR ask from non-admin (or unknown) role. Role limits: LINE/SUPERVISOR/MANAGER must not get payroll data via Help Desk.',
        `Asker role in context: ${role ?? 'unknown'}.`,
        'Knights skipped. Safe refuse draft available for Approve & send if you want a polite no.',
        `Matched: ${match}`,
      ].join(' '),
    }
  }

  return {
    refuse: false,
    reason: null,
    matched: '',
    customerReply: '',
    operatorNote: '',
  }
}

/** Standby / auto-send must never treat payroll topics as low-risk. */
export function isPayrollStandbyBlocked(subject: string, bodies: string[]): boolean {
  const blob = [subject, ...bodies].join('\n')
  return COMPENSATION_SIGNAL.test(blob) || PAYROLL_SENSITIVE_SIGNAL.test(blob)
}
