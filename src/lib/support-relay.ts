import { dispatch } from '@/lib/board-room/connectors'
import { ROSTER, knightConfigured } from '@/lib/board-room/knights'
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
export async function draftAnswer(question: string, context?: unknown): Promise<DraftResult> {
  const seat = pickDraftSeat()
  if (!seat) return { seat: null, answer: null, error: 'No AI seat is configured' }

  const config = ROSTER[seat]
  const ctx = context ? `\n\nDeployment context:\n${JSON.stringify(context).slice(0, 2000)}` : ''
  const result = await dispatch(config, {
    system: answerDraftSystemPrompt(),
    user: `Customer question:\n${question}${ctx}`,
  })

  if (result.status === 'RESPONDED' && result.content) {
    return { seat, answer: result.content, error: null }
  }
  return { seat, answer: null, error: result.error ?? result.status }
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
  const seat = pickDraftSeat()
  if (!seat) return { seat: null, answer: null, error: 'No AI seat is configured' }

  const config = ROSTER[seat]
  const result = await dispatch(config, {
    system: planDraftSystemPrompt(),
    user: `Request type: ${kind}\nTitle: ${title}\nDetail:\n${detail}`,
  })

  if (result.status === 'RESPONDED' && result.content) {
    return { seat, answer: result.content, error: null }
  }
  return { seat, answer: null, error: result.error ?? result.status }
}
