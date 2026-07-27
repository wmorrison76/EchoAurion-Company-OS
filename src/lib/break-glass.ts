/**
 * Break-glass remote session — scaffold only.
 * NOT TeamViewer / RDP. Placeholder for future integration.
 */

import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { checkConstitution } from '@/lib/constitution'

export type BreakGlassStatus = 'REQUESTED' | 'APPROVED' | 'EXPIRED' | 'REVOKED' | 'ENDED'

export interface BreakGlassView {
  id: string
  clientKey: string
  reason: string
  requestedBy: string
  approvedBy: string | null
  status: BreakGlassStatus
  expiresAt: string
  createdAt: string
  banner: string
}

const BANNER =
  'NOT TeamViewer — break-glass is a scaffold for future remote assist. No RDP in this phase.'

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return 30
  return Math.min(60, Math.max(15, Math.floor(n)))
}

export async function requestBreakGlass(input: {
  clientKey: string
  reason: string
  requestedBy: string
  durationMinutes?: number
}): Promise<BreakGlassView> {
  checkConstitution('break_glass')
  if (!input.reason.trim() || input.reason.trim().length < 8) {
    throw new Error('Reason must be at least 8 characters')
  }
  const minutes = clampMinutes(input.durationMinutes ?? 30)
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000)
  const row = await db.breakGlassSession.create({
    data: {
      clientKey: input.clientKey,
      reason: input.reason.trim().slice(0, 500),
      requestedBy: input.requestedBy,
      status: 'REQUESTED',
      expiresAt,
    },
  })
  await audit('william_morrison', 'break_glass.request', row.id, {
    clientKey: input.clientKey,
    minutes,
  })
  return toView(row)
}

export async function approveBreakGlass(input: {
  id: string
  approvedBy: string
  durationMinutes?: number
}): Promise<BreakGlassView> {
  checkConstitution('break_glass')
  const existing = await db.breakGlassSession.findUnique({ where: { id: input.id } })
  if (!existing) throw new Error('Break-glass session not found')
  if (existing.status === 'REVOKED' || existing.status === 'ENDED') {
    throw new Error(`Cannot approve ${existing.status} session`)
  }
  const minutes = clampMinutes(input.durationMinutes ?? 30)
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000)
  const row = await db.breakGlassSession.update({
    where: { id: input.id },
    data: {
      status: 'APPROVED',
      approvedBy: input.approvedBy,
      expiresAt,
    },
  })
  await audit('william_morrison', 'break_glass.approve', row.id, {
    approvedBy: input.approvedBy,
    expiresAt: expiresAt.toISOString(),
  })
  return toView(row)
}

export async function revokeBreakGlass(id: string, actor: string): Promise<BreakGlassView> {
  const row = await db.breakGlassSession.update({
    where: { id },
    data: { status: 'REVOKED' },
  })
  await audit('william_morrison', 'break_glass.revoke', id, { actor })
  return toView(row)
}

export async function listBreakGlass(clientKey?: string): Promise<BreakGlassView[]> {
  await expireStale()
  const rows = await db.breakGlassSession.findMany({
    where: clientKey ? { clientKey } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return rows.map(toView)
}

async function expireStale(): Promise<void> {
  await db.breakGlassSession.updateMany({
    where: {
      status: { in: ['REQUESTED', 'APPROVED'] },
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  })
}

function toView(row: {
  id: string
  clientKey: string
  reason: string
  requestedBy: string
  approvedBy: string | null
  status: string
  expiresAt: Date
  createdAt: Date
}): BreakGlassView {
  return {
    id: row.id,
    clientKey: row.clientKey,
    reason: row.reason,
    requestedBy: row.requestedBy,
    approvedBy: row.approvedBy,
    status: row.status as BreakGlassStatus,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    banner: BANNER,
  }
}
