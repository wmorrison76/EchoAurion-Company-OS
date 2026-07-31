import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

export type ClearStaleSystemResult = {
  resolved: number
  ticketIds: string[]
}

/**
 * Resolve stuck SYSTEM error tickets that clog Help Desk (no knight draft path).
 * Does not touch FEATURE / BILLING / BUILD work.
 */
export async function clearStaleSystemTickets(opts?: {
  actor?: 'william_morrison' | 'computer_agent'
  /** Only tickets older than this many hours (default 0 = all open SYSTEM). */
  olderThanHours?: number
  limit?: number
}): Promise<ClearStaleSystemResult> {
  const actor = opts?.actor ?? 'william_morrison'
  const limit = opts?.limit ?? 100
  const olderThanHours = opts?.olderThanHours ?? 0
  const cutoff =
    olderThanHours > 0 ? new Date(Date.now() - olderThanHours * 60 * 60_000) : undefined

  const tickets = await db.helpTicket.findMany({
    where: {
      channel: 'SYSTEM',
      status: { in: ['OPEN', 'AWAITING_APPROVAL', 'WITH_KNIGHTS'] },
      ...(cutoff ? { createdAt: { lt: cutoff } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  if (tickets.length === 0) {
    return { resolved: 0, ticketIds: [] }
  }

  const ids = tickets.map((t) => t.id)
  const now = new Date()

  await db.helpTicket.updateMany({
    where: { id: { in: ids } },
    data: {
      status: 'RESOLVED',
      resolvedAt: now,
      closeReason: 'stale_system_clear',
      agentWorking: false,
    },
  })

  await audit(actor, 'help_desk.ticket.clear_stale_system', undefined, {
    resolved: ids.length,
    ticketIds: ids.slice(0, 40),
  })

  return { resolved: ids.length, ticketIds: ids }
}
