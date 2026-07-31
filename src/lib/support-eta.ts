/**
 * Help Desk ETA labels — estimates only, never fake precision.
 * Shape + label for colorblind-safe pilot thread chrome.
 */

export type SupportEtaInput = {
  intakeGate?: string | null
  questionStatus?: string | null
  replyState?: 'waiting' | 'replied'
  closeReason?: string | null
  ticketStatus?: string | null
}

/** Customer-facing ETA line, or null when not applicable (e.g. already fixed). */
export function supportEtaLabel(input: SupportEtaInput): string | null {
  const gate = (input.intakeGate ?? '').trim().toUpperCase()
  const replied =
    input.replyState === 'replied' ||
    input.questionStatus === 'ANSWERED' ||
    input.ticketStatus === 'RESOLVED' ||
    input.ticketStatus === 'CLOSED'

  if (replied) {
    if (input.closeReason === 'resolved_fix') return null
    if (input.closeReason === 'reply_sent_code_pending') {
      return 'Est. fix 1–2 business days (estimate)'
    }
    return null
  }

  if (gate === 'BUILD') return 'Est. quote 2–5 business days (estimate)'
  if (gate === 'BILLING') return 'Est. reply 1–2 business days (estimate)'
  if (gate === 'TECH' || gate === 'OTHER' || !gate) {
    return 'Est. reply ~15 min (estimate)'
  }
  return 'Est. reply ~1 business day (estimate)'
}
