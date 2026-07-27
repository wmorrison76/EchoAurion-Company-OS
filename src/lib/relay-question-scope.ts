import type { Prisma } from '@prisma/client'

/**
 * Per-user Help Desk isolation — history / pull must never return
 * org-wide questions. Scope is always clientKey + context.userId.
 */

export function parseRelayUserId(
  raw: string | null | undefined
): string | null {
  const userId = (raw ?? '').trim()
  if (!userId || userId.length > 128) return null
  if (!/^[a-zA-Z0-9_.:-]+$/.test(userId)) return null
  return userId
}

/** Prisma JSON filter: context.userId equals (exact). */
export function userIdContextEquals(
  userId: string
): Prisma.CustomerQuestionWhereInput['context'] {
  return {
    path: ['userId'],
    equals: userId,
  }
}
