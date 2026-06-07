import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { getCompanySnapshot } from './context'
import { formatUSD } from '@/lib/utils'
import type { Prisma } from '@prisma/client'
import type { BriefingDTO } from '@/types/board-room'

// Phase 4 — the 7am daily briefing. Assembles a Company OS snapshot into a
// one-line headline + structured payload for the Board Room briefing card.
export async function generateBriefing(): Promise<BriefingDTO> {
  const snap = await getCompanySnapshot()

  const parts: string[] = []
  if (snap.runwayMonths !== null) parts.push(`Runway ${snap.runwayMonths.toFixed(1)} mo`)
  if (snap.mrr !== null) parts.push(`MRR ${formatUSD(snap.mrr)}`)
  const openDeals = snap.pipeline.reduce((s, p) => s + p.count, 0)
  if (openDeals > 0) parts.push(`${openDeals} open deals`)
  const headline = parts.length > 0 ? parts.join(' · ') : 'Awaiting connected data sources'

  const row = await db.boardBriefing.create({
    data: { headline, snapshot: snap as unknown as Prisma.InputJsonValue },
  })
  await audit('computer_agent', 'board_room.briefing.generate', row.id)

  return {
    id: row.id,
    headline: row.headline,
    snapshot: snap as unknown as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function getLatestBriefing(): Promise<BriefingDTO | null> {
  const row = await db.boardBriefing.findFirst({ orderBy: { createdAt: 'desc' } })
  if (!row) return null
  return {
    id: row.id,
    headline: row.headline,
    snapshot: row.snapshot as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  }
}
