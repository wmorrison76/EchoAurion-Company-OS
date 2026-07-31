import { dispatch } from '@/lib/board-room/connectors'
import { ROSTER, knightConfigured, resolveKnightConfig } from '@/lib/board-room/knights'
import { answerDraftSystemPrompt, planDraftSystemPrompt } from '@/lib/support-voice'
import type { Seat } from '@/types/board-room'

// Preference order for drafting a customer answer: the hospitality-domain seat
// first (it knows the product), then strong general reasoners, then anyone
// available. The product name is never surfaced to the end customer.
const DRAFT_PREFERENCE: Seat[] = ['chefs_brain', 'strategist', 'analyst', 'scout', 'maestro']

export interface DraftResult {
  seat: Seat | null
  answer: string | null
  error: string | null
}

/** Returns the first configured seat in preference order, or null if none. */
export function pickDraftSeat(): Seat | null {
  return DRAFT_PREFERENCE.find((s) => knightConfigured(ROSTER[s])) ?? null
}

/**
 * Has an AI seat draft an answer to a customer's question. The draft is never
 * sent automatically — William reviews and approves it before it goes back to
 * the deployment.
 */
export async function draftAnswer(
  question: string,
  context?: unknown,
  opts?: { replyLanguageLabel?: string | null }
): Promise<DraftResult> {
  const seats = DRAFT_PREFERENCE.filter((s) => knightConfigured(ROSTER[s]))
  if (seats.length === 0) {
    return { seat: null, answer: null, error: 'No AI seat is configured' }
  }

  // Echo AI failure tickets carry systemCheck + steps — allow a larger slice.
  const ctxLimit =
    context &&
    typeof context === 'object' &&
    !Array.isArray(context) &&
    ((context as Record<string, unknown>).source === 'echo_ai' ||
      (context as Record<string, unknown>).echoPriority === true)
      ? 6000
      : 2000
  const ctx = context
    ? `\n\nDeployment context:\n${JSON.stringify(context).slice(0, ctxLimit)}`
    : ''
  const system = answerDraftSystemPrompt({ replyLanguageLabel: opts?.replyLanguageLabel })
  const user = `Customer question:\n${question}${ctx}`

  let lastError: string | null = null
  for (const seat of seats) {
    const result = await dispatch(
      resolveKnightConfig(ROSTER[seat]),
      { system, user },
      { feature: 'support_relay' }
    )
    if (result.status === 'RESPONDED' && result.content) {
      return { seat, answer: result.content, error: null }
    }
    lastError = result.error ?? result.status
  }

  return { seat: seats[0], answer: null, error: lastError }
}

/**
 * Drafts an implementation plan for a billable work request. Sandbox-only:
 * produces a plan for William to review and quote — it never applies anything.
 */
export async function draftPlan(
  title: string,
  detail: string,
  kind: 'FIX' | 'ADDON'
): Promise<DraftResult> {
  const seats = DRAFT_PREFERENCE.filter((s) => knightConfigured(ROSTER[s]))
  if (seats.length === 0) {
    return { seat: null, answer: null, error: 'No AI seat is configured' }
  }

  const system = planDraftSystemPrompt()
  const user = `Request type: ${kind}\nTitle: ${title}\nDetail:\n${detail}`

  let lastError: string | null = null
  for (const seat of seats) {
    const result = await dispatch(
      resolveKnightConfig(ROSTER[seat]),
      { system, user },
      { feature: 'work_plan' }
    )
    if (result.status === 'RESPONDED' && result.content) {
      return { seat, answer: result.content, error: null }
    }
    lastError = result.error ?? result.status
  }

  return { seat: seats[0], answer: null, error: lastError }
}
