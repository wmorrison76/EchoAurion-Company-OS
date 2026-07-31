/**
 * Pilot Help Desk thread metadata — disposition, ETA, fix SHA.
 * Built from CustomerQuestion + linked HelpTicket (no PII beyond thread text).
 */

import { buildCustomerThreadMetaBadge, extractFixedInSha } from '@/lib/fix-disposition'
import { supportEtaLabel } from '@/lib/support-eta'

export type CustomerThreadMeta = {
  closeReason: string | null
  disposition: string | null
  fixSha: string | null
  etaLabel: string | null
  statusBadge: {
    shape: string
    label: string
    level: 'ok' | 'warn' | 'unknown'
  } | null
}

export function buildCustomerThreadMeta(input: {
  intakeGate?: string | null
  questionStatus?: string | null
  replyState: 'waiting' | 'replied'
  closeReason?: string | null
  answer?: string | null
  subject?: string | null
  needsHumanCoreReview?: boolean | null
  ticketStatus?: string | null
  messageBodies?: Array<string | null | undefined>
}): CustomerThreadMeta {
  const closeReason = input.closeReason?.trim() || null
  const badge = buildCustomerThreadMetaBadge({
    status: input.ticketStatus,
    closeReason,
    answer: input.answer,
    subject: input.subject,
    needsHumanCoreReview: input.needsHumanCoreReview,
    messageBodies: input.messageBodies,
  })
  const blobs = [input.answer, input.subject, closeReason, ...(input.messageBodies ?? [])]
    .filter(Boolean)
    .join('\n')
  const fixSha = extractFixedInSha(blobs)

  return {
    closeReason,
    disposition: badge?.disposition ?? null,
    fixSha,
    etaLabel: supportEtaLabel({
      intakeGate: input.intakeGate,
      questionStatus: input.questionStatus,
      replyState: input.replyState,
      closeReason,
      ticketStatus: input.ticketStatus,
    }),
    statusBadge: badge
      ? { shape: badge.shape, label: badge.label, level: badge.level }
      : null,
  }
}
