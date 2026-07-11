/**
 * Autonomy dial — operator-facing modes for Knights / safe tools.
 * Maps onto existing KNIGHTS_STANDBY_MODE / StandbySettings.
 *
 * assist    → draft_only (human approves everything)
 * standby   → auto_answer_low_risk (TEXT how-to only)
 * autopilot → auto_answer_low_risk + may execute allowlisted soft tools
 *             (still cannot merge / paid execute / T3+)
 */

import {
  getStandbyConfig,
  setStandbyConfig,
  type StandbyConfig,
  type StandbyMode,
} from '@/lib/standby'
import { checkConstitution } from '@/lib/constitution'
import { AUTONOMY_DIALS, type AutonomyDial } from '@/lib/autonomy-types'

export type { AutonomyDial } from '@/lib/autonomy-types'
export { AUTONOMY_DIALS, AUTONOMY_LABEL } from '@/lib/autonomy-types'

/** Map elite dial → legacy standby mode used by maybeStandbyAutoApprove. */
export function dialToStandbyMode(dial: AutonomyDial): StandbyMode {
  switch (dial) {
    case 'assist':
      return 'draft_only'
    case 'standby':
    case 'autopilot':
      return 'auto_answer_low_risk'
    default:
      return 'draft_only'
  }
}

/** Best-effort reverse map when only legacy mode is stored. */
export function standbyModeToDial(mode: StandbyMode | string): AutonomyDial {
  if (mode === 'auto_answer_low_risk') return 'standby'
  if (mode === 'draft_only') return 'assist'
  if (mode === 'off') return 'assist'
  if (mode === 'assist' || mode === 'standby' || mode === 'autopilot') return mode
  return 'assist'
}

export interface AutonomyConfig {
  dial: AutonomyDial
  standbyMode: StandbyMode
  maxAutoPerHour: number
  source: StandbyConfig['source']
  updatedAt: string | null
  updatedBy: string | null
  /** Soft tools may publish (non-dry-run) when true. */
  mayExecuteSoftTools: boolean
  mayAutoAnswer: boolean
  mayMergePr: false
  mayExecutePaid: false
  mayAutoApproveT3Plus: false
}

function limitsFor(dial: AutonomyDial): Pick<
  AutonomyConfig,
  'mayExecuteSoftTools' | 'mayAutoAnswer' | 'mayMergePr' | 'mayExecutePaid' | 'mayAutoApproveT3Plus'
> {
  return {
    mayExecuteSoftTools: dial === 'standby' || dial === 'autopilot',
    mayAutoAnswer: dial === 'standby' || dial === 'autopilot',
    mayMergePr: false,
    mayExecutePaid: false,
    mayAutoApproveT3Plus: false,
  }
}

/**
 * Resolve autonomy dial from StandbySettings.mode.
 * Accepts either legacy standby modes or elite dial strings stored in the same column.
 */
export async function getAutonomyConfig(): Promise<AutonomyConfig> {
  const standby = await getStandbyConfig()
  const raw = standby.mode
  let dial: AutonomyDial
  if (raw === 'assist' || raw === 'standby' || raw === 'autopilot') {
    dial = raw
  } else if (raw === 'auto_answer_low_risk') {
    const envDial = (process.env.AUTONOMY_DIAL ?? '').trim().toLowerCase()
    dial = envDial === 'autopilot' ? 'autopilot' : 'standby'
  } else {
    dial = standbyModeToDial(raw)
  }
  const mapped = dialToStandbyMode(dial)
  return {
    dial,
    standbyMode: mapped,
    maxAutoPerHour: standby.maxAutoPerHour,
    source: standby.source,
    updatedAt: standby.updatedAt,
    updatedBy: standby.updatedBy,
    ...limitsFor(dial),
  }
}

export async function setAutonomyDial(input: {
  dial: AutonomyDial
  maxAutoPerHour?: number
  updatedBy: string
}): Promise<AutonomyConfig> {
  await setStandbyConfig({
    mode: input.dial as unknown as StandbyMode,
    maxAutoPerHour: input.maxAutoPerHour,
    updatedBy: input.updatedBy,
  })
  return getAutonomyConfig()
}

/** Whether a tool execute (non-dry-run) is allowed under the current dial. */
export function autonomyAllowsToolExecute(dial: AutonomyDial, dryRun: boolean): boolean {
  if (dryRun) return true
  const check = checkConstitution('invoke_tool', { autonomyDial: dial, dryRun })
  return check.ok && (dial === 'standby' || dial === 'autopilot')
}
