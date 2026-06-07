// Support module (Tier 0) — passive client diagnostics + support sessions.

export const SUPPORT_SESSION_STATUSES = ['OPEN', 'WAITING_ON_CUSTOMER', 'RESOLVED'] as const
export type SupportSessionStatus = (typeof SUPPORT_SESSION_STATUSES)[number]

export type ClientHealth = 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN'

/** A client row for the console: identity + its most recent diagnostic snapshot. */
export interface SupportClientView {
  id: string
  clientKey: string
  label: string
  property: string | null
  health: ClientHealth
  appVersion: string | null
  platform: string | null
  online: boolean
  queueDepth: number
  errorCount: number
  lastSyncAt: string | null
  lastSeenAt: string | null // latest snapshot createdAt
}

export interface SupportSessionView {
  id: string
  topic: string
  status: SupportSessionStatus
  notes: string | null
  clientLabel: string | null
  openedAt: string
  closedAt: string | null
}

// ── Ask-the-Board relay ─────────────────────────────────────────────────────

export const QUESTION_STATUSES = ['NEW', 'DRAFTED', 'ANSWERED', 'DISMISSED'] as const
export type QuestionStatus = (typeof QUESTION_STATUSES)[number]

export interface CustomerQuestionView {
  id: string
  clientKey: string
  clientLabel: string | null
  question: string
  status: QuestionStatus
  draftSeat: string | null
  draftAnswer: string | null
  answer: string | null
  delivered: boolean
  createdAt: string
}

// ── Alerts ──────────────────────────────────────────────────────────────────

export type AlertSeverity = 'INFO' | 'WARN' | 'CRITICAL'

export interface AlertView {
  id: string
  kind: string
  severity: AlertSeverity
  title: string
  body: string | null
  read: boolean
  createdAt: string
}

/** Diagnostic bundle posted by the Electron client (the only inbound write). */
export interface DiagnosticIngest {
  clientKey: string
  label?: string
  property?: string
  appVersion?: string
  platform?: string
  online?: boolean
  queueDepth?: number
  lastSyncAt?: string
  errorCount?: number
  details?: Record<string, unknown>
}
