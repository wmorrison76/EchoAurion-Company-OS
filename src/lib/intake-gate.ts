/**
 * Intake gate taxonomy — TECH | BILLING | BUILD | OTHER.
 * Maps to free support vs WorkAgreement / paid change path.
 * Colorblind-safe: always pair shape + label (never color alone).
 */

export type IntakeGate = 'TECH' | 'BILLING' | 'BUILD' | 'OTHER'
export type IntakeChannel = 'IN_APP' | 'VOICE' | 'PHONE_IVR'

export const INTAKE_GATES: readonly IntakeGate[] = [
  'TECH',
  'BILLING',
  'BUILD',
  'OTHER',
] as const

export const INTAKE_CHANNELS: readonly IntakeChannel[] = [
  'IN_APP',
  'VOICE',
  'PHONE_IVR',
] as const

export interface IntakeGateMeta {
  gate: IntakeGate
  /** Visible label (never color-only). */
  label: string
  /** Shape glyph for colorblind safety. */
  shape: string
  /** Operator route hint. */
  routeHint: string
  /** Free vs paid path. */
  policyPath: 'free' | 'paid' | 'billing'
  /** Whether Knights auto-draft is appropriate. */
  autoKnightsOk: boolean
}

export const INTAKE_GATE_META: Record<IntakeGate, IntakeGateMeta> = {
  TECH: {
    gate: 'TECH',
    label: 'Tech',
    shape: '◆',
    routeHint: 'TECH → Knights / system troubleshooting (free how-to)',
    policyPath: 'free',
    autoKnightsOk: true,
  },
  BILLING: {
    gate: 'BILLING',
    label: 'Billing',
    shape: '●',
    routeHint: 'BILLING → billing policy / invoices (no code change)',
    policyPath: 'billing',
    autoKnightsOk: false,
  },
  BUILD: {
    gate: 'BUILD',
    label: 'Build',
    shape: '■',
    routeHint: 'BUILD → paid change path (WorkAgreement + quote)',
    policyPath: 'paid',
    autoKnightsOk: false,
  },
  OTHER: {
    gate: 'OTHER',
    label: 'Other',
    shape: '○',
    routeHint: 'OTHER → general queue; classify on review',
    policyPath: 'free',
    autoKnightsOk: true,
  },
}

/** DTMF → gate for future phone IVR (press 1–4). */
export const IVR_DTMF_TO_GATE: Record<string, IntakeGate> = {
  '1': 'TECH',
  '2': 'BILLING',
  '3': 'BUILD',
  '4': 'OTHER',
}

export function parseIntakeGate(value: unknown): IntakeGate | null {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return INTAKE_GATES.includes(upper as IntakeGate) ? (upper as IntakeGate) : null
}

export function parseIntakeChannel(value: unknown): IntakeChannel | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase().replace(/-/g, '_')
  if (normalized === 'IN_APP' || normalized === 'INAPP') return 'IN_APP'
  if (normalized === 'VOICE') return 'VOICE'
  if (normalized === 'PHONE_IVR' || normalized === 'PHONE' || normalized === 'IVR') {
    return 'PHONE_IVR'
  }
  return null
}

/** Extract gate from relay payload (top-level or context.gate / context.intakeGate). */
export function gateFromQuestionPayload(input: {
  gate?: unknown
  intakeGate?: unknown
  context?: Record<string, unknown> | null
}): IntakeGate | null {
  return (
    parseIntakeGate(input.gate) ??
    parseIntakeGate(input.intakeGate) ??
    parseIntakeGate(input.context?.gate) ??
    parseIntakeGate(input.context?.intakeGate)
  )
}

export function gateBadgeLabel(gate: IntakeGate | null | undefined): string {
  if (!gate) return '? Unset'
  const m = INTAKE_GATE_META[gate]
  return `${m.shape} ${m.label}`
}
