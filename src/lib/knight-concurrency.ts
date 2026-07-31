/**
 * Process-local semaphore for Knight LLM dispatches.
 * Shared by ingest worker + manual Help Desk convene — protects Neon + LLM budgets.
 * Multi-instance: each Render replica has its own cap (see docs/SCALE_AND_THROTTLE.md).
 */

const MAX_ACTIVE = Math.max(
  1,
  Math.min(10, Math.floor(Number(process.env.KNIGHT_WORKER_CONCURRENCY ?? 3)))
)

let active = 0
const waiters: Array<() => void> = []

function release(): void {
  active = Math.max(0, active - 1)
  const next = waiters.shift()
  if (next) next()
}

/** Wait until a knight dispatch slot is free, then run fn. */
export async function withKnightSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_ACTIVE) {
    await new Promise<void>((resolve) => {
      waiters.push(resolve)
    })
  }
  active += 1
  try {
    return await fn()
  } finally {
    release()
  }
}

export function knightConcurrencyStats(): { active: number; max: number } {
  return { active, max: MAX_ACTIVE }
}
