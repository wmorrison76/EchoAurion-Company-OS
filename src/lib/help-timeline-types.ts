/** Client-safe timeline labels (no DB imports). */

export const TIMELINE_KINDS = [
  'received',
  'detected',
  'fixing',
  'drafting',
  'quoted',
  'agreement_signed',
  'shipping',
  'fixed',
  'done',
] as const

export type TimelineKind = (typeof TIMELINE_KINDS)[number]

/** USER-facing status labels (shape+text friendly). */
export const TIMELINE_LABEL: Record<TimelineKind, string> = {
  received: 'We got your request',
  detected: 'Issue detected',
  fixing: 'We are fixing it',
  drafting: 'Preparing a reply',
  quoted: 'Quote ready for review',
  agreement_signed: 'Agreement signed',
  shipping: 'Change is shipping',
  fixed: 'Fix is live',
  done: 'Complete — you are set',
}

/** Short operator labels (Help Desk console). */
export const TIMELINE_LABEL_OPERATOR: Record<TimelineKind, string> = {
  received: 'Received',
  detected: 'Detected',
  fixing: 'Fixing',
  drafting: 'Drafting',
  quoted: 'Quoted',
  agreement_signed: 'Signed',
  shipping: 'Shipping',
  fixed: 'Fixed',
  done: 'Done',
}
