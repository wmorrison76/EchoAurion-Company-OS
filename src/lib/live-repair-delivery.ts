/**
 * Live repair delivery after Help Desk Approve & send / resolve.
 *
 * Soft fixes (show_message, open_panel, config flags) → SSE immediately.
 * Echo AI tickets → silent `echo_repair_ready` only (no user toast / reload).
 * Code deploys for normal tickets → update_available banner; auto-reload is
 * OFF on the pilot by default (ECHO_SOFT_RELOAD).
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
  | {
      type: 'echo_repair_ready'
      message?: string
      panelId?: string
      failedStep?: string
    }

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
  if (t === 'echo_repair_ready') {
    return {
      type: 'echo_repair_ready',
      message: typeof d.message === 'string' ? d.message : undefined,
      panelId: typeof d.panelId === 'string' ? d.panelId : undefined,
      failedStep: typeof d.failedStep === 'string' ? d.failedStep : undefined,
    }
  }
  if (t === 'soft_reload' || t === 'client_update' || t === 'update_available') {
    return d as SoftDirective
  }
  return null
}

function contextPanelId(context: unknown): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  const c = context as Record<string, unknown>
  if (typeof c.panelId === 'string') return c.panelId
  if (typeof c.moduleHint === 'string' && c.moduleHint !== 'echo_ai') return c.moduleHint
  return null
}

function contextFailedStep(context: unknown): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  const c = context as Record<string, unknown>
  return typeof c.failedStep === 'string' ? c.failedStep : null
}

/** Echo-only SSE — pilot UI must not toast / reload. */
export async function publishEchoRepairReady(input: {
  clientKey: string
  ticketId: string
  questionId?: string
  message?: string
  panelId?: string | null
  failedStep?: string | null
}): Promise<void> {
  const payload = {
    type: 'echo_repair_ready' as const,
    ticketId: input.ticketId,
    questionId: input.questionId ?? null,
    message: input.message ?? 'repair made — try again',
    panelId: input.panelId ?? null,
    failedStep: input.failedStep ?? null,
    echoSilent: true,
    source: 'echo_ai',
    intakeChannel: 'ECHO',
  }
  console.info('[live-repair] echo_repair_ready', {
    clientKey: input.clientKey,
    ticketId: input.ticketId,
    panelId: payload.panelId,
  })
  await publishRelayEvent(input.clientKey, 'echo_repair_ready' as RelayEventType, payload)
  await publishRelayEvent(input.clientKey, 'directive', payload)
}

/**
 * Fan-out typed SSE events for soft directives so pilots get them without refresh.
 * Echo silent tickets skip user-facing show_message / soft_reload.
 */
export async function publishSoftDirectiveLive(
  clientKey: string,
  directive: unknown,
  ticketId?: string,
  opts?: { echoSilent?: boolean }
): Promise<void> {
  const d = asDirective(directive)
  if (!d) return

  if (opts?.echoSilent) {
    if (d.type === 'echo_repair_ready' || d.type === 'open_panel' || d.type === 'navigate') {
      // open_panel/navigate for Echo are still soft UX; allow without toast.
      if (d.type === 'echo_repair_ready') {
        await publishEchoRepairReady({
          clientKey,
          ticketId: ticketId ?? 'unknown',
          message: d.message,
          panelId: d.panelId,
          failedStep: d.failedStep,
        })
        return
      }
    } else {
      console.info('[live-repair] skip user directive for Echo silent', d.type)
      return
    }
  }

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
  if (d.type === 'echo_repair_ready') {
    await publishEchoRepairReady({
      clientKey,
      ticketId: ticketId ?? 'unknown',
      message: d.message,
      panelId: d.panelId,
      failedStep: d.failedStep,
    })
    return
  }
  if (d.type === 'soft_reload' || d.type === 'client_update') {
    // Banner-only notice — pilot auto-reload is OFF by default.
    await publishSoftReloadNotice({
      clientKey,
      ticketId,
      reason:
        ('reason' in d && typeof d.reason === 'string' && d.reason) ||
        'A fix is live — apply when convenient without losing drafts.',
      mode: 'banner_only',
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
    // Pilot ignores auto soft_reload unless ECHO_SOFT_RELOAD=true
    updateDirective: 'banner_only',
    mode: 'banner_only' as const,
  }
  await publishRelayEvent(input.clientKey, 'update_available' as RelayEventType, payload)
  await publishRelayEvent(input.clientKey, 'directive', payload)
}

export async function publishSoftReloadNotice(input: {
  clientKey: string
  ticketId?: string
  reason?: string
  mode?: 'soft_reload' | 'banner_only'
}): Promise<void> {
  // Default banner_only — never instruct pilot to auto-reload.
  const mode = input.mode ?? 'banner_only'
  const payload = {
    type: 'soft_reload' as const,
    reason: input.reason ?? 'A fix is live — apply when convenient.',
    preserveDrafts: true,
    ticketId: input.ticketId ?? null,
    mode,
  }
  await publishRelayEvent(input.clientKey, 'soft_reload' as RelayEventType, payload)
  await publishRelayEvent(input.clientKey, 'client_update' as RelayEventType, {
    type: 'client_update',
    mode,
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
 * Echo AI → echo_repair_ready only (silent). Normal tickets → soft directives.
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
}): Promise<{
  softDirective: boolean
  codeDeployNotice: boolean
  echoRepairReady: boolean
}> {
  let softDirective = false
  let codeDeployNotice = false
  let echoRepairReady = false

  const echoAi = input.echoAi === true || isEchoAiTicket(input)

  if (echoAi) {
    // Do not publish user-facing answer_ready / show_message / soft_reload.
    // Caller may have already published answer_ready — Echo client suppresses chrome.
    await publishEchoRepairReady({
      clientKey: input.clientKey,
      ticketId: input.ticketId,
      questionId: input.questionId,
      message: 'repair made — try again',
      panelId: contextPanelId(input.context) ?? input.moduleHint,
      failedStep: contextFailedStep(input.context),
    })
    echoRepairReady = true

    if (input.directive != null) {
      await publishSoftDirectiveLive(input.clientKey, input.directive, input.ticketId, {
        echoSilent: true,
      })
      softDirective = asDirective(input.directive) != null
    }

    console.info('[live-repair] Echo silent approve delivery', {
      ticketId: input.ticketId,
      echoRepairReady: true,
    })
    return { softDirective, codeDeployNotice: false, echoRepairReady }
  }

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
    echoAi: false,
    context: input.context,
  })

  if (codeDeploy) {
    codeDeployNotice = true
    // banner_only — pilot will not auto-reload unless ECHO_SOFT_RELOAD=true
    await publishSoftReloadNotice({
      clientKey: input.clientKey,
      ticketId: input.ticketId,
      reason:
        'Fix is live. Apply when convenient from the update banner if shown — drafts are preserved.',
      mode: 'banner_only',
    })
  }

  return { softDirective, codeDeployNotice, echoRepairReady }
}
