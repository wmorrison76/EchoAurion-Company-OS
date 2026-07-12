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

export const TIMELINE_LABEL: Record<TimelineKind, string> = {
  received: 'Received',
  detected: 'Issue detected',
  fixing: 'Fixing',
  drafting: 'Drafting',
  quoted: 'Quoted',
  agreement_signed: 'Agreement signed',
  shipping: 'Shipping',
  fixed: 'Fixed',
  done: 'Done',
}
