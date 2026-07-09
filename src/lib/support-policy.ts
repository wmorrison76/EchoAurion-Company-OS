import type { ComplexityTier } from '@/lib/pricing'

/**
 * Canonical Free vs Charge support policy for EchoAurion Company OS.
 * Pure + client-safe so Support UI can recommend live while William triages.
 *
 * Full narrative: SUPPORT_POLICY.md at repo root.
 */

export const FREE_ANSWER_TARGET_MINUTES = 10

export const FREE_CATEGORIES = [
  {
    id: 'howto',
    label: 'How-to questions',
    examples: 'Where do I find X? How do I run tonight’s report?',
  },
  {
    id: 'config_guidance',
    label: 'Config guidance',
    examples: 'Which setting to flip; walk-through of existing toggles',
  },
  {
    id: 'troubleshoot_diagnose',
    label: 'Troubleshooting diagnosis',
    examples: 'What is broken and why — without shipping a code change',
  },
  {
    id: 'status_check',
    label: 'Status checks',
    examples: 'Is the sync healthy? Did last night’s job finish?',
  },
  {
    id: 'under_10_min',
    label: 'Answers under ~10 minutes',
    examples: 'Any clear Q&A you can resolve in a short call or reply',
  },
  {
    id: 'product_behavior',
    label: 'Clarifying product behavior',
    examples: 'Is this expected? What does this screen mean?',
  },
  {
    id: 'bug_triage',
    label: '"Is this a bug?" triage',
    examples: 'Reproduce, classify, and advise — fix may still be billable',
  },
] as const

export const CHARGE_CATEGORIES = [
  {
    id: 'custom_feature',
    label: 'Custom feature / add-on',
    examples: 'New screen, workflow, or capability the product does not have',
  },
  {
    id: 'data_model',
    label: 'Data model changes',
    examples: 'New fields, schema, migrations that alter stored data',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    examples: 'New POS/PMS/payroll connectors or webhook plumbing',
  },
  {
    id: 'migrations',
    label: 'Migrations & cutovers',
    examples: 'Data import, environment moves, one-off transforms',
  },
  {
    id: 'bespoke_reports',
    label: 'Bespoke reports',
    examples: 'Custom exports or dashboards beyond stock reporting',
  },
  {
    id: 'code_beyond_config',
    label: 'Code beyond config',
    examples: 'Anything that needs a deploy, not just a setting change',
  },
  {
    id: 't2_plus',
    label: 'T2+ implementation work',
    examples: 'Minor through major change requests (see pricing tiers)',
  },
] as const

export type PolicyRecommendation = 'FREE_ANSWER' | 'COMPLIMENTARY_FIX' | 'QUOTE_REQUIRED'

export interface PolicyInput {
  /** 'QUESTION' for Ask-the-Board; 'FIX' | 'ADDON' for change requests. */
  kind?: 'QUESTION' | 'FIX' | 'ADDON' | string | null
  title?: string | null
  detail?: string | null
  /** Rough effort estimate in minutes, if known. */
  estimatedMinutes?: number | null
}

export interface PolicyVerdict {
  recommendation: PolicyRecommendation
  reason: string
  /** Suggested billable tier when recommendation is QUOTE_REQUIRED. */
  suggestedTier: ComplexityTier | null
  /** Shape + label for colorblind-safe UI chips. */
  shape: '✓' | '◇' | '$'
  label: string
  /** Short operator hint for the triage banner. */
  operatorHint: string
}

const FREE_SIGNAL =
  /\b(how (do|to|can)|where (is|do|can)|what (is|does|should)|why (is|does|did)|can i|help me understand|walk ?me through|status|healthy|sync|is this (a )?bug|expected|clarif|troubleshoot|diagnos|config(uration)?|setting|toggle|explain)\b/i

const CHARGE_SIGNAL =
  /\b(add[- ]?on|new feature|build|implement|integrat|migrat|schema|data model|custom (report|export|dashboard|screen|workflow)|bespoke|webhook|connector|api (for|to)|deploy|code change|refactor)\b/i

const T1_SIGNAL =
  /\b(copy|typo|label|wording|toggle|flag|config(uration)? only|setting only|rename|css tweak|one[- ]line)\b/i

const T4_SIGNAL =
  /\b(integrat|schema|data model|migrat|multi[- ]tenant|architect)\b/i

const T5_SIGNAL = /\b(bespoke|from scratch|greenfield|rewrite|platform[- ]wide)\b/i

function combinedText(input: PolicyInput): string {
  return [input.kind, input.title, input.detail].filter(Boolean).join(' ').trim()
}

function suggestTier(text: string, kind: string | null | undefined): ComplexityTier {
  if (T5_SIGNAL.test(text) || kind === 'ADDON' && /platform|rewrite/i.test(text)) return 'T5'
  if (T4_SIGNAL.test(text)) return 'T4'
  if (kind === 'ADDON') return 'T3'
  if (T1_SIGNAL.test(text)) return 'T1'
  return 'T2'
}

/**
 * Recommend Free answer, complimentary small fix, or a paid quote.
 * Heuristic only — William’s Approve free / Send quote buttons remain authoritative.
 */
export function classifySupportRequest(input: PolicyInput): PolicyVerdict {
  const text = combinedText(input)
  const kind = input.kind ?? null
  const minutes = input.estimatedMinutes

  // Explicit short Q&A window → stay helpful and free.
  if (
    (kind === 'QUESTION' || kind == null) &&
    minutes != null &&
    minutes > 0 &&
    minutes <= FREE_ANSWER_TARGET_MINUTES &&
    !CHARGE_SIGNAL.test(text)
  ) {
    return {
      recommendation: 'FREE_ANSWER',
      reason: `Answerable in about ${minutes} minute${minutes === 1 ? '' : 's'} — under the ${FREE_ANSWER_TARGET_MINUTES}-minute helpfulness target.`,
      suggestedTier: null,
      shape: '✓',
      label: 'Free answer',
      operatorHint: 'Draft a clear reply; no quote needed.',
    }
  }

  // Ask-the-Board questions default free unless they clearly ask for build work.
  if (kind === 'QUESTION') {
    if (CHARGE_SIGNAL.test(text)) {
      const tier = suggestTier(text, 'ADDON')
      return {
        recommendation: 'QUOTE_REQUIRED',
        reason: 'Question reads like a build/change request, not pure Q&A.',
        suggestedTier: tier,
        shape: '$',
        label: 'Quote required',
        operatorHint: `Move to Change Requests and quote ${tier}+, or Approve free if you choose to gift it.`,
      }
    }
    return {
      recommendation: 'FREE_ANSWER',
      reason: 'Informational / how-to / triage — aim to answer in under 10 minutes.',
      suggestedTier: null,
      shape: '✓',
      label: 'Free answer',
      operatorHint: 'Keep it warm and concrete; Approve & send when ready.',
    }
  }

  // Change requests (FIX / ADDON)
  if (kind === 'ADDON' || CHARGE_SIGNAL.test(text)) {
    const tier = suggestTier(text, kind)
    if (tier === 'T1' && T1_SIGNAL.test(text)) {
      return {
        recommendation: 'COMPLIMENTARY_FIX',
        reason: 'Looks like a trivial config/copy change — often complimentary at founder discretion.',
        suggestedTier: 'T1',
        shape: '◇',
        label: 'Complimentary fix?',
        operatorHint: 'Approve free if goodwill; otherwise Send quote at T1 floor.',
      }
    }
    return {
      recommendation: 'QUOTE_REQUIRED',
      reason:
        kind === 'ADDON'
          ? 'Add-on / custom work — billable unless you explicitly Approve free.'
          : 'Request needs implementation beyond a quick answer.',
      suggestedTier: tier,
      shape: '$',
      label: 'Quote required',
      operatorHint: `Suggest ${tier} · Send quote, or Approve free if you are covering it.`,
    }
  }

  if (kind === 'FIX') {
    if (T1_SIGNAL.test(text) || (minutes != null && minutes > 0 && minutes <= FREE_ANSWER_TARGET_MINUTES)) {
      return {
        recommendation: 'COMPLIMENTARY_FIX',
        reason: 'Small fix / config-level — often complimentary; still your call.',
        suggestedTier: 'T1',
        shape: '◇',
        label: 'Complimentary fix?',
        operatorHint: 'Approve free for goodwill, or Send quote at T1.',
      }
    }
    if (FREE_SIGNAL.test(text) && !CHARGE_SIGNAL.test(text)) {
      return {
        recommendation: 'FREE_ANSWER',
        reason: 'Reads as diagnosis/guidance more than a code change.',
        suggestedTier: null,
        shape: '✓',
        label: 'Free answer',
        operatorHint: 'Answer first; open a Change Request only if they need a ship.',
      }
    }
    const tier = suggestTier(text, kind)
    return {
      recommendation: 'QUOTE_REQUIRED',
      reason: 'Fix likely needs a code or data change beyond config.',
      suggestedTier: tier,
      shape: '$',
      label: 'Quote required',
      operatorHint: `Suggest ${tier} · Send quote after Knights draft the plan.`,
    }
  }

  // Fallback: unknown kind — lean helpful if short, else quote.
  if (minutes != null && minutes <= FREE_ANSWER_TARGET_MINUTES && !CHARGE_SIGNAL.test(text)) {
    return {
      recommendation: 'FREE_ANSWER',
      reason: 'Short informational ask — stay free and helpful.',
      suggestedTier: null,
      shape: '✓',
      label: 'Free answer',
      operatorHint: 'Reply under the 10-minute target when you can.',
    }
  }

  if (FREE_SIGNAL.test(text) && !CHARGE_SIGNAL.test(text)) {
    return {
      recommendation: 'FREE_ANSWER',
      reason: 'Looks like guidance or triage, not a build.',
      suggestedTier: null,
      shape: '✓',
      label: 'Free answer',
      operatorHint: 'Draft a clear answer; escalate to quote only if they need a ship.',
    }
  }

  const tier = suggestTier(text, kind)
  return {
    recommendation: 'QUOTE_REQUIRED',
    reason: 'Ambiguous but leans toward implementation — quote unless you gift it.',
    suggestedTier: tier,
    shape: '$',
    label: 'Quote required',
    operatorHint: `Default to ${tier} quote; Approve free only when intentional.`,
  }
}

/** Human-readable SLA line for UI and docs. */
export const SUPPORT_ANSWER_SLA =
  `Aim to answer informational questions in under ${FREE_ANSWER_TARGET_MINUTES} minutes — warm, clear, and ready for the floor.`
