/**
 * Live repair delivery after Help Desk Approve & send / resolve.
 *
 * Soft fixes (show_message, open_panel, config flags) → SSE immediately.
 * Code deploys → update_available + soft_reload (pilot banner; no silent wipe).
 */

import {
  publishAnswerReady,
  publishRelayEvent,
  publishShowMessage,
  publishOpenPanel,
  publishNavigate,
  type RelayEventType,
} from '@/lib/relay-outbox'
import { isEchoAiTicket, looksLikeCodeDeployFix } from '@/lib/echo-ticket-priority'

export { looksLikeCodeDeployFix }

export type SoftDirective =
  | { type: 'show_message'; title: string; body: string; severity?: string }
  | { type: 'open_panel'; panelId: string; params?: Record<string, unknown> | null }
  | { type: 'navigate'; path: string }
  | { type: 'soft_reload'; reason?: string; preserveDrafts?: boolean }
  | { type: 'client_update'; mode: 'soft_reload' | 'banner_only'; reason?: string }
  | { type: 'update_available'; title?: string; body?: string; buildId?: string }

function asDirective(raw: unknown): SoftDirective | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  const t = String(d.type ?? '')
  if (t === 'show_message' && typeof d.title === 'string' && typeof d.body === 'string') {
    return {
      type: 'show_message',
      title: d.title,
      body: d.body,
      severity: typeof d.severity === 'string' ? d.severity : undefined,
    }
  }
  if (t === 'open_panel' && typeof d.panelId === 'string') {
    return {
      type: 'open_panel',
      panelId: d.panelId,
      params: (d.params as Record<string, unknown> | null) ?? null,
    }
  }
  if (t === 'navigate' && typeof d.path === 'string') {
    return { type: 'navigate', path: d.path }
  }
  if (t === 'soft_reload' || t === 'client_update' || t === 'update_available') {
    return d as SoftDirective
  }
  return null
}

/**
 * Fan-out typed SSE events for soft directives so pilots get them without refresh.
 */
export async function publishSoftDirectiveLive(
  clientKey: string,
  directive: unknown,
  ticketId?: string
): Promise<void> {
  const d = asDirective(directive)
  if (!d) return

  if (d.type === 'show_message') {
    await publishShowMessage({
      clientKey,
      title: d.title,
      body: d.body,
      severity:
        d.severity === 'success' ||
        d.severity === 'warning' ||
        d.severity === 'error' ||
        d.severity === 'info'
          ? d.severity
          : 'info',
      ticketId,
    })
    return
  }
  if (d.type === 'open_panel') {
    await publishOpenPanel({
      clientKey,
      panelId: d.panelId,
      params: d.params ?? undefined,
      ticketId,
    })
    return
  }
  if (d.type === 'navigate') {
    await publishNavigate({ clientKey, path: d.path, ticketId })
    return
  }
  if (d.type === 'soft_reload' || d.type === 'client_update') {
    await publishSoftReloadNotice({
      clientKey,
      ticketId,
      reason:
        ('reason' in d && typeof d.reason === 'string' && d.reason) ||
        'A fix is live — apply when convenient without losing drafts.',
      mode: d.type === 'client_update' && d.mode === 'banner_only' ? 'banner_only' : 'soft_reload',
    })
    return
  }
  if (d.type === 'update_available') {
    await publishUpdateAvailable({
      clientKey,
      ticketId,
      title: d.title,
      body: d.body,
      buildId: d.buildId,
    })
  }
}

export async function publishUpdateAvailable(input: {
  clientKey: string
  ticketId?: string
  title?: string
  body?: string
  buildId?: string
}): Promise<void> {
  const payload = {
    type: 'update_available' as const,
    title: input.title ?? 'Update ready',
    body:
      input.body ??
      'A fix is live. Apply when convenient — open recipe drafts are preserved until you reload.',
    buildId: input.buildId ?? null,
    ticketId: input.ticketId ?? null,
    updateDirective: 'soft_reload',
  }
  await publishRelayEvent(input.clientKey, 'update_available' as RelayEventType, payload)
  await publishRelayEvent(input.clientKey, 'directive', payload)
  await publishRelayEvent(input.clientKey, 'feature_available', {
    type: 'feature_available',
    title: payload.title,
    body: payload.body,
    ticketId: payload.ticketId,
    updateDirective: 'soft_reload',
  })
}

export async function publishSoftReloadNotice(input: {
  clientKey: string
  ticketId?: string
  reason?: string
  mode?: 'soft_reload' | 'banner_only'
}): Promise<void> {
  const payload = {
    type: 'soft_reload' as const,
    reason: input.reason ?? 'Fix is live — applying without losing your work.',
    preserveDrafts: true,
    ticketId: input.ticketId ?? null,
    mode: input.mode ?? 'soft_reload',
  }
  await publishRelayEvent(input.clientKey, 'soft_reload' as RelayEventType, payload)
  await publishRelayEvent(input.clientKey, 'client_update' as RelayEventType, {
    type: 'client_update',
    mode: input.mode ?? 'soft_reload',
    reason: payload.reason,
    ticketId: payload.ticketId,
  })
  await publishRelayEvent(input.clientKey, 'directive', payload)
  await publishUpdateAvailable({
    clientKey: input.clientKey,
    ticketId: input.ticketId,
    title: 'Update ready',
    body: payload.reason,
  })
}

/**
 * After Approve & send: answer_ready is already published by caller.
 * Also fan-out soft directives immediately + optional soft_reload for code fixes.
 */
export async function afterApproveDeliverLive(input: {
  clientKey: string
  ticketId: string
  questionId: string
  question: string
  answer: string
  directive?: unknown
  moduleHint?: string | null
  intakeChannel?: string | null
  echoAi?: boolean
  context?: unknown
  /** When true, skip re-publishing answer_ready (caller already did). */
  answerReadyPublished?: boolean
}): Promise<{ softDirective: boolean; codeDeployNotice: boolean }> {
  let softDirective = false
  let codeDeployNotice = false

  if (!input.answerReadyPublished) {
    await publishAnswerReady({
      clientKey: input.clientKey,
      questionId: input.questionId,
      question: input.question,
      answer: input.answer,
      directive: input.directive,
    })
  }

  if (input.directive != null) {
    await publishSoftDirectiveLive(input.clientKey, input.directive, input.ticketId)
    softDirective = asDirective(input.directive) != null
  }

  const codeDeploy = looksLikeCodeDeployFix({
    answer: input.answer,
    moduleHint: input.moduleHint,
    intakeChannel: input.intakeChannel,
    echoAi: input.echoAi,
    context: input.context,
  })

  if (codeDeploy) {
    codeDeployNotice = true
    await publishSoftReloadNotice({
      clientKey: input.clientKey,
      ticketId: input.ticketId,
      reason:
        'Fix is live — applying without losing your work. Save any open recipe, then Apply.',
      mode: 'soft_reload',
    })
    await publishShowMessage({
      clientKey: input.clientKey,
      title: 'Fix is live',
      body: 'Update ready — apply when convenient. Open drafts are not wiped until you reload.',
      severity: 'success',
      ticketId: input.ticketId,
    })
  } else if (input.echoAi || isEchoAiTicket(input)) {
    // Echo TECH reply without deploy → toast only (answer already on SSE).
    await publishShowMessage({
      clientKey: input.clientKey,
      title: 'Help Desk reply',
      body: input.answer.slice(0, 280),
      severity: 'success',
      ticketId: input.ticketId,
    })
  }

  return { softDirective, codeDeployNotice }
}
