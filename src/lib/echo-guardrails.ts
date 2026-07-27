/**
 * William’s Echo → Help Desk guardrails (Company OS side).
 * Budget, hard clientKey, consent audit, success-cancel, panel p95 learning.
 */

import { allowRateLimit } from './rate-limit'
import { isEchoAiContext } from './echo-ticket-priority'

/** Max Echo→Help Desk tickets per clientKey per hour (default 8). */
export function echoTicketsPerClientPerHour(): number {
  const n = Number(process.env.ECHO_TICKETS_PER_CLIENT_PER_HOUR ?? '8')
  if (!Number.isFinite(n) || n < 1) return 8
  return Math.min(Math.floor(n), 200)
}

export function allowEchoTicketBudget(clientKey: string): {
  ok: true
} | {
  ok: false
  retryAfterSec: number
  code: 'ECHO_BUDGET'
  label: string
} {
  const max = echoTicketsPerClientPerHour()
  const r = allowRateLimit(
    `echo:tickets:ck:${clientKey}`,
    max,
    60 * 60_000
  )
  if (!r.ok) {
    return {
      ok: false,
      retryAfterSec: r.retryAfterSec,
      code: 'ECHO_BUDGET',
      label: `⚠ Echo ticket budget — max ${max}/hour for this property`,
    }
  }
  return { ok: true }
}

/** Kill switch mirrored from pilot — Company OS also refuses when off. */
export function isEchoPanelWatchEnabled(): boolean {
  const raw = (process.env.ECHO_PANEL_WATCH ?? 'on').trim().toLowerCase()
  if (raw === 'off' || raw === 'false' || raw === '0' || raw === 'disabled') {
    return false
  }
  return true
}

/**
 * Hard multi-property isolation for Echo filings.
 * Rejects missing/placeholder clientKeys and requires echo_ai source markers.
 */
export function enforceEchoClientKey(input: {
  clientKey: string | null | undefined
  context: unknown
}):
  | { ok: true; clientKey: string; echoAi: boolean }
  | { ok: false; status: number; error: string; code: string } {
  const clientKey = input.clientKey?.trim()
  if (!clientKey) {
    return {
      ok: false,
      status: 400,
      error: 'clientKey is required for Echo tickets',
      code: 'CLIENT_KEY_REQUIRED',
    }
  }
  const lowered = clientKey.toLowerCase()
  if (
    lowered === 'manual' ||
    lowered === 'unknown' ||
    lowered === 'null' ||
    lowered === 'undefined' ||
    lowered === 'shared' ||
    lowered === 'global'
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Echo tickets require a real property clientKey',
      code: 'CLIENT_KEY_ISOLATION',
    }
  }
  const echoAi = isEchoAiContext(input.context)
  return { ok: true, clientKey, echoAi }
}

/** Consent / audit payload — why Echo filed (SOC / diligence). */
export function echoFileWhy(context: unknown): {
  why: string
  failureKind: string | null
  panelId: string | null
  silent: boolean
} {
  const c =
    context && typeof context === 'object' && !Array.isArray(context)
      ? (context as Record<string, unknown>)
      : {}
  const failureKind =
    typeof c.failureKind === 'string' ? c.failureKind.slice(0, 64) : null
  const panelId =
    typeof c.panelId === 'string'
      ? c.panelId.slice(0, 80)
      : typeof c.moduleHint === 'string'
        ? c.moduleHint.slice(0, 80)
        : null
  const silent = c.silent !== false
  const parts = [
    'Echo silent radio filed TECH ticket',
    failureKind ? `kind=${failureKind}` : null,
    panelId ? `panel=${panelId}` : null,
    typeof c.loadThreshold === 'string'
      ? `threshold=${c.loadThreshold}`
      : null,
    typeof c.elapsedMs === 'number'
      ? `elapsedMs=${Math.round(c.elapsedMs)}`
      : null,
    silent ? 'user_not_notified' : 'disclose_self_audit',
  ].filter(Boolean)
  return {
    why: parts.join(' · ').slice(0, 400),
    failureKind,
    panelId,
    silent,
  }
}

/** Minutes before human on-call email (default 30). */
export function echoOncallMinutes(): number {
  const n = Number(process.env.ECHO_ONCALL_MINUTES ?? '30')
  if (!Number.isFinite(n) || n < 5) return 30
  return Math.min(Math.floor(n), 24 * 60)
}

export type PanelOpenSample = {
  panelId: string
  elapsedMs: number
  at: string
}

/**
 * Anonymized p95 open times only — no userId / goals / emails.
 * In-memory per process; also durable via knowledge plane when wired.
 */
const openSamples = new Map<string, number[]>()
const MAX_SAMPLES_PER_PANEL = 80

export function recordAnonymizedPanelOpen(input: {
  panelId: string
  elapsedMs: number
  clientKey: string
}): { panelId: string; p95Ms: number | null; samples: number } {
  const panelId = String(input.panelId).toLowerCase().trim().slice(0, 80)
  const elapsedMs = Math.round(input.elapsedMs)
  if (!panelId || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 600_000) {
    return { panelId, p95Ms: null, samples: 0 }
  }
  // Key by panel only (fleet learning) — never store clientKey in sample values.
  const arr = openSamples.get(panelId) ?? []
  arr.push(elapsedMs)
  if (arr.length > MAX_SAMPLES_PER_PANEL) arr.splice(0, arr.length - MAX_SAMPLES_PER_PANEL)
  openSamples.set(panelId, arr)
  return { panelId, p95Ms: percentileMs(arr, 95), samples: arr.length }
}

export function getPanelOpenP95(panelId: string): number | null {
  const arr = openSamples.get(String(panelId).toLowerCase().trim())
  if (!arr?.length) return null
  return percentileMs(arr, 95)
}

export function listPanelOpenP95(): Array<{
  panelId: string
  p95Ms: number
  samples: number
}> {
  const out: Array<{ panelId: string; p95Ms: number; samples: number }> = []
  for (const [panelId, arr] of openSamples) {
    if (arr.length < 3) continue
    const p95 = percentileMs(arr, 95)
    if (p95 != null) out.push({ panelId, p95Ms: p95, samples: arr.length })
  }
  return out.sort((a, b) => b.p95Ms - a.p95Ms)
}

function percentileMs(sortedInput: number[], p: number): number | null {
  if (sortedInput.length === 0) return null
  const sorted = [...sortedInput].sort((a, b) => a - b)
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  )
  return sorted[idx] ?? null
}

/** Seed baselines (ms) — Culinary lighter than Inventory; learning overrides. */
export const PANEL_BASELINE_SEED_MS: Record<string, { slowMs: number; failMs: number }> = {
  culinary: { slowMs: 1200, failMs: 6000 },
  culinary_sidebar: { slowMs: 1200, failMs: 6000 },
  inventory: { slowMs: 3000, failMs: 10000 },
  supply: { slowMs: 3000, failMs: 10000 },
  maestro: { slowMs: 2000, failMs: 8000 },
  chronos: { slowMs: 2500, failMs: 9000 },
  guest: { slowMs: 999_999, failMs: 999_999 }, // never auto-ticket
}

/**
 * Regression: current p95 > seed fail * factor → night-cleaner signal.
 * factor default 1.5 via ECHO_PANEL_REGRESSION_FACTOR.
 */
export function panelP95RegressionSignals(): Array<{
  panelId: string
  p95Ms: number
  baselineFailMs: number
  label: string
}> {
  const factor = Number(process.env.ECHO_PANEL_REGRESSION_FACTOR ?? '1.5')
  const f = Number.isFinite(factor) && factor >= 1.1 ? factor : 1.5
  const signals: Array<{
    panelId: string
    p95Ms: number
    baselineFailMs: number
    label: string
  }> = []
  for (const row of listPanelOpenP95()) {
    const seed = PANEL_BASELINE_SEED_MS[row.panelId]
    const baselineFailMs = seed?.failMs ?? 8000
    if (row.p95Ms > baselineFailMs * f && row.samples >= 5) {
      signals.push({
        panelId: row.panelId,
        p95Ms: row.p95Ms,
        baselineFailMs,
        label: `▲ Panel p95 regression · ${row.panelId} p95=${row.p95Ms}ms > ${Math.round(baselineFailMs * f)}ms`,
      })
    }
  }
  return signals
}

export function __resetEchoGuardrailsForTests(): void {
  openSamples.clear()
}
