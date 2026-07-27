import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { Actor } from '@/lib/audit'
import type { Prisma } from '@prisma/client'
import type { BoardActionDTO, BoardActionType } from '@/types/board-room'

// The action layer turns a Maestro synthesis into typed, EDITABLE drafts. The
// gate is two-step: PROPOSED → (operator) APPROVED → (operator) EXECUTED.
// Execute only ever PREPARES and records a draft — it never sends email, writes
// calendar events, or opens tickets on its own. Wiring an outward send is a
// deliberate flip at the marked hooks below.

type RawAction = {
  type: BoardActionType
  title: string
  summary: string
  payload: Record<string, unknown>
}

function firstLines(text: string, n: number): string {
  return text.split('\n').filter((l) => l.trim()).slice(0, n).join(' ').slice(0, 400)
}

// Heuristic extraction from the synthesis — directional, operator-editable.
function deriveActions(problem: string, synthesis: string): RawAction[] {
  const lower = synthesis.toLowerCase()
  const gist = firstLines(synthesis, 3) || problem
  const actions: RawAction[] = []

  // A decision record is always proposed.
  actions.push({
    type: 'NOTE',
    title: `Decision record: ${problem.slice(0, 60)}`,
    summary: gist,
    payload: { problem, synthesis },
  })

  if (/\b(implement|build|fix|refactor|ship|code|deploy|migrate)\b/.test(lower)) {
    actions.push({
      type: 'TICKET',
      title: `Engineering: ${problem.slice(0, 60)}`,
      summary: 'Architect ticket derived from the Board plan.',
      payload: {
        repo: 'wmorrison76/EchoAurion-Company-OS',
        body: gist,
        labels: ['board-room'],
      },
    })
  }

  if (/\b(email|reach out|contact|follow up|outreach|investor|partner)\b/.test(lower)) {
    actions.push({
      type: 'EMAIL',
      title: `Email draft: ${problem.slice(0, 60)}`,
      summary: 'Draft only — review before sending.',
      payload: { to: '', subject: problem.slice(0, 80), body: gist },
    })
  }

  if (/\b(meeting|schedule|call|sync|demo|walkthrough)\b/.test(lower)) {
    actions.push({
      type: 'CALENDAR',
      title: `Schedule: ${problem.slice(0, 60)}`,
      summary: 'Proposed calendar event — confirm time before booking.',
      payload: { title: problem.slice(0, 80), durationMins: 30, notes: gist },
    })
  }

  return actions
}

function toDTO(a: {
  id: string
  sessionId: string | null
  type: string
  status: string
  title: string
  summary: string | null
  payload: unknown
  result: unknown
  sandbox: boolean
  createdAt: Date
}): BoardActionDTO {
  return {
    id: a.id,
    sessionId: a.sessionId,
    type: a.type as BoardActionDTO['type'],
    status: a.status as BoardActionDTO['status'],
    title: a.title,
    summary: a.summary,
    payload: (a.payload as Record<string, unknown> | null) ?? null,
    result: (a.result as Record<string, unknown> | null) ?? null,
    sandbox: a.sandbox,
    createdAt: a.createdAt.toISOString(),
  }
}

/** Generates proposed actions for a completed session (idempotent per session). */
export async function proposeActions(sessionId: string, actor: Actor): Promise<BoardActionDTO[]> {
  const session = await db.boardRoomSession.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error('Session not found')

  const existing = await db.boardAction.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  })
  if (existing.length > 0) return existing.map(toDTO)

  const drafts = deriveActions(session.problem, session.synthesis ?? '')
  const created = await Promise.all(
    drafts.map((d) =>
      db.boardAction.create({
        data: {
          sessionId,
          type: d.type,
          title: d.title,
          summary: d.summary,
          payload: d.payload as Prisma.InputJsonValue,
          sandbox: session.sandbox,
          actor,
        },
      })
    )
  )
  await audit(actor, 'board_room.actions.propose', sessionId, { count: created.length })
  return created.map(toDTO)
}

export async function listActions(sessionId: string): Promise<BoardActionDTO[]> {
  const rows = await db.boardAction.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(toDTO)
}

export async function approveAction(id: string, actor: Actor): Promise<BoardActionDTO> {
  const action = await db.boardAction.update({ where: { id }, data: { status: 'APPROVED' } })
  await audit(actor, 'board_room.action.approve', id, { type: action.type })
  return toDTO(action)
}

export async function dismissAction(id: string, actor: Actor): Promise<BoardActionDTO> {
  const action = await db.boardAction.update({ where: { id }, data: { status: 'DISMISSED' } })
  await audit(actor, 'board_room.action.dismiss', id)
  return toDTO(action)
}

/**
 * Executes an APPROVED action. By design this only PREPARES a draft and records
 * it — no outward send. The marked hooks are where a real Gmail draft / GitHub
 * issue / calendar insert would be wired once the operator opts in.
 */
export async function executeAction(id: string, actor: Actor): Promise<BoardActionDTO> {
  const action = await db.boardAction.findUnique({ where: { id } })
  if (!action) throw new Error('Action not found')
  if (action.status !== 'APPROVED') {
    throw new Error('Action must be APPROVED before it can be executed')
  }

  let result: Record<string, unknown>
  switch (action.type) {
    case 'EMAIL':
      // HOOK(email): never auto-send. A real wiring would create a Gmail DRAFT
      // (gmail.compose) for the operator to review and send manually.
      result = { prepared: 'email_draft', sent: false, note: 'Draft prepared — not sent.' }
      break
    case 'TICKET':
      // HOOK(ticket): with a repo:write token, create a GitHub issue here.
      result = { prepared: 'github_issue', created: false, note: 'Issue body prepared — not opened.' }
      break
    case 'CALENDAR':
      // HOOK(calendar): with Calendar access, insert a tentative event here.
      result = { prepared: 'calendar_event', booked: false, note: 'Event drafted — not booked.' }
      break
    default:
      result = { prepared: 'note', stored: true }
  }

  const updated = await db.boardAction.update({
    where: { id },
    data: { status: 'EXECUTED', result: result as Prisma.InputJsonValue },
  })
  await audit(actor, 'board_room.action.execute', id, { type: action.type, ...result })
  return toDTO(updated)
}
