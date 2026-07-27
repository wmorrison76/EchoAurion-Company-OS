import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export type Actor = 'william_morrison' | 'computer_agent'

/**
 * Records a mutating action to the audit_log table.
 * Action naming convention: `module.entity.verb` (CLAUDE.md §19).
 *
 * Every mutation in the app MUST call this (Absolute Rule #8). Callers that
 * cannot tolerate a failed write (e.g. auth) should `.catch()` the result.
 */
export async function audit(
  actor: Actor,
  action: string,
  entityId?: string,
  payload?: Prisma.InputJsonValue
): Promise<void> {
  await db.auditLog.create({
    data: {
      actor,
      action,
      entityId: entityId ?? null,
      payload: payload ?? undefined,
    },
  })
}
