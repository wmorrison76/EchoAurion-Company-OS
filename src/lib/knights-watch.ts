/**
 * Compact Knights "watching" health — seats + last convene + cron drain.
 * No secrets, no ticket bodies.
 */

import { db } from '@/lib/db'
import { KNIGHT_SEATS, MAESTRO, ROSTER, knightConfigured } from '@/lib/board-room/knights'
import {
  envHelpDeskAutoSendTech,
  shouldAutoKnightsOnQuestion,
} from '@/lib/help-desk-auto-flags'
import { getStandbyConfig } from '@/lib/standby'
import { pickDraftSeat } from '@/lib/support-relay'
import type { StatusLevel } from '@/types'
import type { KnightsWatchSnapshot } from '@/types/knights-watch'

export { envHelpDeskAutoSendTech } from '@/lib/help-desk-auto-flags'

export async function getKnightsWatchSnapshot(): Promise<KnightsWatchSnapshot> {
  const seatsLive = [MAESTRO, ...KNIGHT_SEATS.map((s) => ROSTER[s])]
    .filter((c) => knightConfigured(c))
    .map((c) => c.name)

  const [lastConvene, lastDrain, standby] = await Promise.all([
    db.auditLog.findFirst({
      where: { action: { in: ['help_desk.knights.dispatch', 'help_desk.agent.loop'] } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.auditLog.findFirst({
      where: { action: { in: ['ops.drain_queue', 'ops.poll_failures'] } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    getStandbyConfig(),
  ])

  const lastConveneAt = lastConvene?.createdAt ?? null
  const minutesSinceLastConvene = lastConveneAt
    ? Math.round((Date.now() - lastConveneAt.getTime()) / 60_000)
    : null

  const lastDrainAt = lastDrain?.createdAt ?? null
  const minutesSinceLastDrain = lastDrainAt
    ? Math.round((Date.now() - lastDrainAt.getTime()) / 60_000)
    : null

  const cronStale = minutesSinceLastDrain == null || minutesSinceLastDrain > 20
  const autoKnightsOn = shouldAutoKnightsOnQuestion()
  const techAutoSendEnv = envHelpDeskAutoSendTech()
  const hasSeat = Boolean(pickDraftSeat())

  let level: StatusLevel = 'ok'
  let shape = '✓'
  let label = 'Knights watching'

  if (!hasSeat) {
    level = 'error'
    shape = '✕'
    label = 'No AI seats configured'
  } else if (!autoKnightsOn) {
    level = 'warn'
    shape = '⚠'
    label = 'Auto-Knights off'
  } else if (cronStale) {
    level = 'warn'
    shape = '⚠'
    label = minutesSinceLastDrain == null ? 'Watching · ops-poll never ran' : 'Watching · cron stale'
  } else if (minutesSinceLastConvene == null) {
    level = 'ok'
    shape = '◎'
    label = 'Knights ready (no convene yet)'
  }

  return {
    seatsConfigured: seatsLive.length,
    seatsLive,
    autoKnightsOn,
    techAutoSendEnv,
    autoSendPermitActive: standby.autoSendActive,
    lastConveneAt: lastConveneAt?.toISOString() ?? null,
    minutesSinceLastConvene,
    cronStale,
    minutesSinceLastDrain,
    level,
    shape,
    label,
  }
}
