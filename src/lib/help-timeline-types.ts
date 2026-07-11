/** Client-safe timeline labels (no DB imports). */

export const TIMELINE_KINDS = [
  'received',
  'drafting',
  'quoted',
  'agreement_signed',
  'shipping',
  'done',
] as const

export type TimelineKind = (typeof TIMELINE_KINDS)[number]

export const TIMELINE_LABEL: Record<TimelineKind, string> = {
  received: 'Received',
  drafting: 'Drafting',
  quoted: 'Quoted',
  agreement_signed: 'Agreement signed',
  shipping: 'Shipping',
  done: 'Done',
}
