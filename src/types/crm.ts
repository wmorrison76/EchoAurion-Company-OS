// ── CRM payloads (CLAUDE.md §13) ────────────────────────────────────────────

export const DEAL_STAGES = [
  'IDENTIFIED',
  'CONTACTED',
  'RESPONDED',
  'MEETING',
  'ACTIVE',
  'CLOSED_WON',
  'CLOSED_LOST',
] as const
export type DealStage = (typeof DEAL_STAGES)[number]

export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  IDENTIFIED: 'Identified',
  CONTACTED: 'Contacted',
  RESPONDED: 'Responded',
  MEETING: 'Meeting',
  ACTIVE: 'Active',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
}

export const OUTREACH_STATUSES = [
  'SENT',
  'OPENED',
  'RESPONDED',
  'BOUNCED',
  'NO_REPLY',
] as const
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]

export const OUTREACH_CHANNELS = ['email', 'linkedin', 'phone', 'in_person'] as const
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number]

export interface BoardCard {
  dealId: string
  contactId: string
  name: string
  company: string | null
  title: string | null
  tags: string[]
  value: number | null
  stage: DealStage
  lastOutreachAt: string | null
}

export interface OutreachDTO {
  id: string
  channel: string
  subject: string | null
  body: string | null
  sentAt: string
  status: OutreachStatus
  responseAt: string | null
  actor: string
}

export interface DealDTO {
  id: string
  title: string
  value: number | null
  stage: DealStage
  notes: string | null
  expectedCloseDate: string | null
}

export interface ContactDetail {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  company: string | null
  title: string | null
  linkedIn: string | null
  tags: string[]
  notes: string | null
  outreach: OutreachDTO[]
  deals: DealDTO[]
}
