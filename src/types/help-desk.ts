export type HelpTicketChannel = 'TEXT' | 'VOICE' | 'FEATURE' | 'SYSTEM'
export type HelpTicketStatus =
  | 'OPEN'
  | 'WAITING'
  | 'WITH_KNIGHTS'
  | 'AWAITING_APPROVAL'
  | 'RESOLVED'
  | 'CLOSED'
export type HelpMessageRole = 'CUSTOMER' | 'ADMIN' | 'KNIGHT' | 'SYSTEM'
export type HelpVoiceNoteSource = 'UPLOAD' | 'DICTATION' | 'PASTE'
export type HelpTicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

export interface HelpMessageView {
  id: string
  role: HelpMessageRole
  body: string
  seat: string | null
  createdAt: string
}

export interface HelpVoiceNoteView {
  id: string
  transcript: string
  durationSec: number | null
  source: HelpVoiceNoteSource
  createdAt: string
}

export interface HelpTicketListItem {
  id: string
  channel: HelpTicketChannel
  status: HelpTicketStatus
  priority: string
  subject: string
  clientKey: string | null
  requesterName: string | null
  workRequestId: string | null
  customerQuestionId: string | null
  messageCount: number
  updatedAt: string
  createdAt: string
  resolvedAt: string | null
}

export interface HelpTicketDetail extends HelpTicketListItem {
  clientId: string | null
  boardSessionId: string | null
  messages: HelpMessageView[]
  voiceNotes: HelpVoiceNoteView[]
  policy: {
    recommendation: string
    shape: string
    label: string
    operatorHint: string
    suggestedTier: string | null
    reason: string
  } | null
}
