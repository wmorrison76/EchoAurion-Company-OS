import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { dispatch } from './connectors'
import { ROSTER, MAESTRO, KNIGHT_SEATS } from './knights'
import { buildKnightContext, getCompanySnapshot, type CompanySnapshot } from './context'
import type { BoardRoomSessionDTO, KnightResponseDTO, Seat } from '@/types/board-room'

/** Overall convene budget — must stay under Render/route maxDuration (60s). */
const CONVENE_BUDGET_MS = 55_000

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

async function runKnight(
  sessionId: string,
  seat: Seat,
  problem: string,
  snap: CompanySnapshot
): Promise<void> {
  const config = ROSTER[seat]
  const result = await dispatch(
    config,
    {
      system: knightSystemPrompt(seat),
      // Live DB context with the per-seat permission layer (Phase 3).
      user: await buildKnightContext(seat, problem, snap),
    },
    { feature: 'board_room' }
  )
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

  const result = await dispatch(
    MAESTRO,
    {
      system:
        'You are the Maestro conducting the EchoAurion Board Room. Synthesize the knights’ ' +
        'responses into a single ranked action plan. For each recommendation give a confidence ' +
        'rating and surface any dissent between knights. Silent Service: the operator sees a clean, ' +
        'actionable plan, not the scaffolding. Flag any knight that could not contribute.',
      user: `Problem:\n${problem}\n\nKnight responses:\n${transcript}`,
    },
    { feature: 'board_room' }
  )

  if (result.status === 'RESPONDED' && result.content) return result.content
  return `Maestro synthesis unavailable (${result.status}: ${result.error ?? 'no detail'}). ${responses.filter((r) => r.status === 'RESPONDED').length} of ${responses.length} knights responded.`
}

async function markPendingTimedOut(sessionId: string): Promise<void> {
  await db.knightResponse.updateMany({
    where: { sessionId, status: 'PENDING' },
    data: {
      status: 'TIMEOUT',
      error: 'Convene budget exceeded before this knight finished',
    },
  })
}

async function loadResponseDtos(sessionId: string): Promise<KnightResponseDTO[]> {
  const responses = await db.knightResponse.findMany({ where: { sessionId } })
  return responses.map((r) => ({
    id: r.id,
    seat: r.seat as Seat,
    name: ROSTER[r.seat as Seat]?.name ?? r.seat,
    model: r.model,
    status: r.status,
    content: r.content,
    error: r.error,
    latencyMs: r.latencyMs,
  }))
}

/**
 * Creates a session, dispatches every knight in parallel, then synthesizes.
 * Always returns a session id — partial knight results are kept even if the
 * overall budget is hit or synthesis fails.
 */
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

  const started = Date.now()
  const remaining = () => Math.max(0, CONVENE_BUDGET_MS - (Date.now() - started))

  try {
    // One snapshot for all knights — avoids N parallel Stripe/revenue fetches.
    const snap = await getCompanySnapshot()

    // Parallel dispatch — knights stream in independently (spec note #4).
    // Race against remaining budget so we never hang past maxDuration.
    const dispatchWork = Promise.allSettled(
      KNIGHT_SEATS.map((seat) => runKnight(session.id, seat, problem, snap))
    )
    await Promise.race([
      dispatchWork,
      new Promise<void>((resolve) => setTimeout(resolve, remaining())),
    ])
    // Let in-flight knight writes settle briefly, then force-timeout leftovers.
    await Promise.race([
      dispatchWork,
      new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
    ])
    await markPendingTimedOut(session.id)

    await db.boardRoomSession.update({
      where: { id: session.id },
      data: { status: 'SYNTHESIZING' },
    })

    const dtos = await loadResponseDtos(session.id)

    let synthesis: string
    if (remaining() < 3_000) {
      synthesis = `Maestro synthesis skipped (convene budget). ${dtos.filter((r) => r.status === 'RESPONDED').length} of ${dtos.length} knights responded.`
    } else {
      synthesis = await Promise.race([
        synthesize(problem, dtos),
        new Promise<string>((resolve) =>
          setTimeout(
            () =>
              resolve(
                `Maestro synthesis timed out. ${dtos.filter((r) => r.status === 'RESPONDED').length} of ${dtos.length} knights responded.`
              ),
            remaining()
          )
        ),
      ])
    }

    await db.boardRoomSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETE', synthesis },
    })
    await audit(actor, 'board_room.session.synthesize', session.id)
  } catch (error) {
    await markPendingTimedOut(session.id)
    const message = error instanceof Error ? error.message : 'Convene failed'
    const dtos = await loadResponseDtos(session.id)
    const partial = `${dtos.filter((r) => r.status === 'RESPONDED').length} of ${dtos.length} knights responded before failure.`
    await db.boardRoomSession.update({
      where: { id: session.id },
      data: {
        status: 'FAILED',
        synthesis: `Convene failed: ${message}. ${partial}`,
      },
    })
    await audit(actor, 'board_room.session.failed', session.id, { error: message })
    // Still return the id so the UI can open partial results instead of hanging.
  }

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
