import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { dispatch } from './connectors'
import { ROSTER, MAESTRO, KNIGHT_SEATS } from './knights'
import type { BoardRoomSessionDTO, KnightResponseDTO, Seat } from '@/types/board-room'

/**
 * Hard write-guard (spec note #5): a sandbox session must NEVER mutate
 * production business tables. The action layer (Phase 4) must call this before
 * any INSERT/UPDATE/DELETE on production data.
 */
export function assertCanWriteProduction(sandbox: boolean): void {
  if (sandbox) {
    throw new Error('Sandbox session: writes to production data are forbidden')
  }
}

function knightSystemPrompt(seat: Seat): string {
  const k = ROSTER[seat]
  return [
    `You are ${k.name}, a seat at the EchoAurion Board Room. Role: ${k.role}.`,
    'V&A standard: no surface-level answers — quantify impact and be specific.',
    k.hasDbAccess
      ? 'You have live access to the platform database; ground answers in real data.'
      : 'You do NOT have database access; reason from the provided context only.',
    'If you cannot complete the task, say so explicitly rather than guessing.',
  ].join(' ')
}

// Echo (Chef's Brain) is the only seat permitted raw DB context (spec note #3).
async function buildContext(seat: Seat, problem: string): Promise<string> {
  if (ROSTER[seat].hasDbAccess) {
    // TODO(claude): assemble live DB slices relevant to the problem (Phase 3).
    return `Problem: ${problem}\n\nYou may reference live platform data where relevant.`
  }
  return `Problem: ${problem}\n\nContext summary: (no raw platform data is shared with this seat).`
}

async function runKnight(sessionId: string, seat: Seat, problem: string): Promise<void> {
  const config = ROSTER[seat]
  const result = await dispatch(config, {
    system: knightSystemPrompt(seat),
    user: await buildContext(seat, problem),
  })
  await db.knightResponse.updateMany({
    where: { sessionId, seat },
    data: {
      status: result.status,
      content: result.content,
      error: result.error,
      latencyMs: result.latencyMs,
    },
  })
}

async function synthesize(problem: string, responses: KnightResponseDTO[]): Promise<string> {
  const transcript = responses
    .map((r) =>
      r.status === 'RESPONDED'
        ? `## ${r.name} (${r.model})\n${r.content}`
        : `## ${r.name} (${r.model})\n[${r.status}] ${r.error ?? ''}`
    )
    .join('\n\n')

  const result = await dispatch(MAESTRO, {
    system:
      'You are the Maestro conducting the EchoAurion Board Room. Synthesize the knights’ ' +
      'responses into a single ranked action plan. For each recommendation give a confidence ' +
      'rating and surface any dissent between knights. Silent Service: the operator sees a clean, ' +
      'actionable plan, not the scaffolding. Flag any knight that could not contribute.',
    user: `Problem:\n${problem}\n\nKnight responses:\n${transcript}`,
  })

  if (result.status === 'RESPONDED' && result.content) return result.content
  return `Maestro synthesis unavailable (${result.status}: ${result.error ?? 'no detail'}). ${responses.filter((r) => r.status === 'RESPONDED').length} of ${responses.length} knights responded.`
}

/** Creates a session, dispatches every knight in parallel, then synthesizes. */
export async function convene(
  problem: string,
  sandbox: boolean,
  actor: 'william_morrison' | 'computer_agent'
): Promise<string> {
  const session = await db.boardRoomSession.create({
    data: {
      problem,
      sandbox,
      actor,
      status: 'DISPATCHING',
      responses: {
        create: KNIGHT_SEATS.map((seat) => ({
          seat,
          model: ROSTER[seat].model,
          status: 'PENDING',
        })),
      },
    },
  })

  await audit(actor, 'board_room.session.create', session.id, { sandbox })

  // Parallel dispatch — knights stream in independently (spec note #4).
  await Promise.allSettled(KNIGHT_SEATS.map((seat) => runKnight(session.id, seat, problem)))

  await db.boardRoomSession.update({
    where: { id: session.id },
    data: { status: 'SYNTHESIZING' },
  })

  const responses = await db.knightResponse.findMany({ where: { sessionId: session.id } })
  const dtos: KnightResponseDTO[] = responses.map((r) => ({
    id: r.id,
    seat: r.seat as Seat,
    name: ROSTER[r.seat as Seat]?.name ?? r.seat,
    model: r.model,
    status: r.status,
    content: r.content,
    error: r.error,
    latencyMs: r.latencyMs,
  }))

  const synthesis = await synthesize(problem, dtos)

  await db.boardRoomSession.update({
    where: { id: session.id },
    data: { status: 'COMPLETE', synthesis },
  })
  await audit(actor, 'board_room.session.synthesize', session.id)

  return session.id
}

export async function getSession(id: string): Promise<BoardRoomSessionDTO | null> {
  const session = await db.boardRoomSession.findUnique({
    where: { id },
    include: { responses: { orderBy: { seat: 'asc' } } },
  })
  if (!session) return null
  return {
    id: session.id,
    problem: session.problem,
    sandbox: session.sandbox,
    status: session.status,
    synthesis: session.synthesis,
    actor: session.actor,
    createdAt: session.createdAt.toISOString(),
    responses: session.responses.map((r) => ({
      id: r.id,
      seat: r.seat as Seat,
      name: ROSTER[r.seat as Seat]?.name ?? r.seat,
      model: r.model,
      status: r.status,
      content: r.content,
      error: r.error,
      latencyMs: r.latencyMs,
    })),
  }
}
