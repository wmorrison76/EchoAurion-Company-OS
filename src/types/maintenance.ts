export const MAINTENANCE_SEVERITIES = ['INFO', 'WARN', 'CRITICAL'] as const
export type MaintenanceSeverity = (typeof MAINTENANCE_SEVERITIES)[number]

export const MAINTENANCE_STATUSES = ['DRAFT', 'SCHEDULED', 'SENT', 'CANCELLED'] as const
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]

export const MAINTENANCE_TARGET_SCOPES = ['ALL', 'CLIENT_KEY', 'PROPERTY'] as const
export type MaintenanceTargetScope = (typeof MAINTENANCE_TARGET_SCOPES)[number]

export interface MaintenanceNoticeView {
  id: string
  title: string
  body: string
  severity: MaintenanceSeverity
  status: MaintenanceStatus
  scheduledFor: string | null
  sentAt: string | null
  windowStart: string | null
  windowEnd: string | null
  targetScope: MaintenanceTargetScope
  targetValue: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** Payload pushed on RelayOutbox type `maintenance_notice` (and mirrored show_message). */
export interface MaintenanceNoticePayload {
  type: 'maintenance_notice'
  noticeId: string
  title: string
  body: string
  severity: 'info' | 'warning' | 'error'
  windowStart: string | null
  windowEnd: string | null
}
