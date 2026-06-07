import type { ComplexityTier } from '@/lib/pricing'

export const WORK_KINDS = ['FIX', 'ADDON'] as const
export type WorkKind = (typeof WORK_KINDS)[number]

export const WORK_STATUSES = [
  'RECEIVED',
  'QUOTED',
  'AUTHORIZED',
  'IN_PROGRESS',
  'EXECUTED',
  'ROLLED_BACK',
  'DECLINED',
] as const
export type WorkStatus = (typeof WORK_STATUSES)[number]

export interface WorkRequestView {
  id: string
  clientKey: string
  clientLabel: string | null
  kind: WorkKind
  title: string
  detail: string
  requesterName: string | null
  requesterRole: string | null
  tier: ComplexityTier | null
  humanHours: number | null
  quoteTotal: number | null
  draftSeat: string | null
  draftPlan: string | null
  approvedByCustomer: boolean
  customerApprover: string | null
  approvedByAdmin: boolean
  rollbackRef: string | null
  status: WorkStatus
  createdAt: string
}

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  RECEIVED: 'Received',
  QUOTED: 'Quoted',
  AUTHORIZED: 'Authorized',
  IN_PROGRESS: 'In progress',
  EXECUTED: 'Executed',
  ROLLED_BACK: 'Rolled back',
  DECLINED: 'Declined',
}
