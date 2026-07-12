/**
 * Enforced SLA clocks for Help Desk — first response + resolve.
 * Targets are gate-aware; UI always uses shape + label (colorblind-safe).
 * Soft copy target (10 min how-to) remains in support-policy.ts for FREE answers.
 */

import type { IntakeGate } from '@/lib/intake-gate'

export type SlaStatusLevel = 'ok' | 'warn' | 'error' | 'unknown'

export interface SlaClockView {
  firstResponseDueAt: string | null
  resolveDueAt: string | null
  firstResponseAt: string | null
  slaBreachedAt: string | null
  slaEscalatedAt: string | null
  /** Overall: first-response and/or resolve. */
  status: SlaStatusLevel
  shape: '✓' | '▲' | '✕' | '?'
  label: string
  firstResponseStatus: SlaStatusLevel
  resolveStatus: SlaStatusLevel
  minutesToFirstResponseDue: number | null
  minutesToResolveDue: number | null
}

/** Minutes from create → first admin/knight reply due. */
export const SLA_FIRST_RESPONSE_MINUTES: Record<IntakeGate | 'DEFAULT', number> = {
  TECH: 30,
  BILLING: 60,
  BUILD: 120,
  OTHER: 60,
  DEFAULT: 60,
}

/** Minutes from create → resolve due (open ticket clock). */
export const SLA_RESOLVE_MINUTES: Record<IntakeGate | 'DEFAULT', number> = {
  TECH: 4 * 60,
  BILLING: 8 * 60,
  BUILD: 48 * 60,
  OTHER: 8 * 60,
  DEFAULT: 8 * 60,
}

/** Warn when this fraction of the clock remains (e.g. 0.2 = last 20%). */
const WARN_REMAINING_FRACTION = 0.2

export function slaTargetsForGate(gate: IntakeGate | null | undefined): {
  firstResponseMinutes: number
  resolveMinutes: number
} {
  const key = gate && gate in SLA_FIRST_RESPONSE_MINUTES ? gate : 'DEFAULT'
  return {
    firstResponseMinutes: SLA_FIRST_RESPONSE_MINUTES[key as IntakeGate | 'DEFAULT'],
    resolveMinutes: SLA_RESOLVE_MINUTES[key as IntakeGate | 'DEFAULT'],
  }
}

export function computeSlaDueDates(
  createdAt: Date,
  gate: IntakeGate | null | undefined
): { firstResponseDueAt: Date; resolveDueAt: Date } {
  const { firstResponseMinutes, resolveMinutes } = slaTargetsForGate(gate)
  return {
    firstResponseDueAt: new Date(createdAt.getTime() + firstResponseMinutes * 60_000),
    resolveDueAt: new Date(createdAt.getTime() + resolveMinutes * 60_000),
  }
}

function minutesUntil(due: Date | null | undefined, now: Date): number | null {
  if (!due) return null
  return Math.round((due.getTime() - now.getTime()) / 60_000)
}

function clockStatus(opts: {
  due: Date | null | undefined
  metAt: Date | null | undefined
  createdAt: Date
  totalMinutes: number
  now: Date
  terminal?: boolean
}): SlaStatusLevel {
  if (opts.terminal && opts.metAt) {
    return opts.metAt.getTime() <= (opts.due?.getTime() ?? Infinity) ? 'ok' : 'error'
  }
  if (opts.metAt) {
    return opts.due && opts.metAt.getTime() > opts.due.getTime() ? 'error' : 'ok'
  }
  if (!opts.due) return 'unknown'
  const remaining = opts.due.getTime() - opts.now.getTime()
  if (remaining < 0) return 'error'
  const warnMs = opts.totalMinutes * 60_000 * WARN_REMAINING_FRACTION
  if (remaining <= warnMs) return 'warn'
  return 'ok'
}

function worst(...levels: SlaStatusLevel[]): SlaStatusLevel {
  if (levels.includes('error')) return 'error'
  if (levels.includes('warn')) return 'warn'
  if (levels.includes('unknown')) return 'unknown'
  return 'ok'
}

function badge(level: SlaStatusLevel): { shape: SlaClockView['shape']; label: string } {
  switch (level) {
    case 'ok':
      return { shape: '✓', label: 'On track' }
    case 'warn':
      return { shape: '▲', label: 'At risk' }
    case 'error':
      return { shape: '✕', label: 'Breached' }
    default:
      return { shape: '?', label: 'Unknown' }
  }
}

export function evaluateSla(input: {
  createdAt: Date
  intakeGate?: IntakeGate | null
  firstResponseAt?: Date | null
  firstResponseDueAt?: Date | null
  resolveDueAt?: Date | null
  resolvedAt?: Date | null
  slaBreachedAt?: Date | null
  slaEscalatedAt?: Date | null
  status?: string | null
  now?: Date
}): SlaClockView {
  const now = input.now ?? new Date()
  const targets = slaTargetsForGate(input.intakeGate)
  const firstDue =
    input.firstResponseDueAt ??
    computeSlaDueDates(input.createdAt, input.intakeGate).firstResponseDueAt
  const resolveDue =
    input.resolveDueAt ?? computeSlaDueDates(input.createdAt, input.intakeGate).resolveDueAt
  const terminal =
    input.status === 'RESOLVED' || input.status === 'CLOSED'

  const firstResponseStatus = clockStatus({
    due: firstDue,
    metAt: input.firstResponseAt,
    createdAt: input.createdAt,
    totalMinutes: targets.firstResponseMinutes,
    now,
  })
  const resolveStatus = clockStatus({
    due: resolveDue,
    metAt: input.resolvedAt,
    createdAt: input.createdAt,
    totalMinutes: targets.resolveMinutes,
    now,
    terminal,
  })

  const status = worst(firstResponseStatus, resolveStatus)
  const { shape, label } = badge(status)

  return {
    firstResponseDueAt: firstDue.toISOString(),
    resolveDueAt: resolveDue.toISOString(),
    firstResponseAt: input.firstResponseAt?.toISOString() ?? null,
    slaBreachedAt: input.slaBreachedAt?.toISOString() ?? null,
    slaEscalatedAt: input.slaEscalatedAt?.toISOString() ?? null,
    status,
    shape,
    label,
    firstResponseStatus,
    resolveStatus,
    minutesToFirstResponseDue: input.firstResponseAt
      ? null
      : minutesUntil(firstDue, now),
    minutesToResolveDue: terminal ? null : minutesUntil(resolveDue, now),
  }
}

/** True when either clock is past due and unmet. */
export function isSlaBreached(input: {
  firstResponseAt?: Date | null
  firstResponseDueAt?: Date | null
  resolveDueAt?: Date | null
  resolvedAt?: Date | null
  status?: string | null
  now?: Date
}): boolean {
  const now = input.now ?? new Date()
  const terminal = input.status === 'RESOLVED' || input.status === 'CLOSED'
  if (!input.firstResponseAt && input.firstResponseDueAt && input.firstResponseDueAt < now) {
    return true
  }
  if (!terminal && input.resolveDueAt && input.resolveDueAt < now) {
    return true
  }
  if (terminal && input.resolvedAt && input.resolveDueAt && input.resolvedAt > input.resolveDueAt) {
    return true
  }
  return false
}
