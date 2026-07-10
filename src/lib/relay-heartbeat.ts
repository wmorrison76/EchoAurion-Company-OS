import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { raiseAlert } from '@/lib/alerts'
import { computeHealth } from '@/lib/support'
import type { ClientHealth } from '@/types/support'

export interface HeartbeatInput {
  clientKey: string
  label?: string
  property?: string
  appVersion?: string
  platform?: string
  online?: boolean
  queueDepth?: number
  lastSyncAt?: string
  errorCount?: number
  details?: Record<string, unknown>
  /** When true, also write a DiagnosticSnapshot (diagnostics ingest). */
  persistSnapshot?: boolean
}

export interface HeartbeatResult {
  clientId: string
  health: ClientHealth
  snapshotId?: string
}

/**
 * Canonical pilot heartbeat — upserts SupportClient, updates lastHeartbeatAt,
 * optionally persists a DiagnosticSnapshot, and raises alerts on RED.
 *
 * Used by POST /api/relay/heartbeat and POST /api/support/diagnostics.
 */
export async function applyHeartbeat(input: HeartbeatInput): Promise<HeartbeatResult> {
  const online = input.online ?? true
  const queueDepth = input.queueDepth ?? 0
  const errorCount = input.errorCount ?? 0
  const lastSyncAt = input.lastSyncAt ? new Date(input.lastSyncAt) : null
  const health = computeHealth({ online, queueDepth, errorCount, lastSyncAt })

  const client = await db.supportClient.upsert({
    where: { clientKey: input.clientKey },
    create: {
      clientKey: input.clientKey,
      label: input.label ?? input.clientKey,
      property: input.property ?? null,
      lastHeartbeatAt: new Date(),
      lastHealth: health,
    },
    update: {
      ...(input.label ? { label: input.label } : {}),
      ...(input.property ? { property: input.property } : {}),
      lastHeartbeatAt: new Date(),
      lastHealth: health,
    },
  })

  let snapshotId: string | undefined
  if (input.persistSnapshot) {
    const snapshot = await db.diagnosticSnapshot.create({
      data: {
        clientId: client.id,
        appVersion: input.appVersion ?? null,
        platform: input.platform ?? null,
        online,
        queueDepth,
        lastSyncAt,
        errorCount,
        health,
        details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    snapshotId = snapshot.id
  }

  await audit('computer_agent', 'relay.heartbeat', client.id, {
    health,
    queueDepth,
    errorCount,
    persistSnapshot: !!input.persistSnapshot,
  })

  if (health === 'RED') {
    await raiseAlert({
      kind: 'client_health',
      severity: 'CRITICAL',
      title: `Pilot RED: ${client.label}`,
      body: `clientKey=${input.clientKey} queue=${queueDepth} errors=${errorCount}`,
      entityRef: client.id,
      url: '/support/pilot-links',
    })
  }

  return { clientId: client.id, health, snapshotId }
}

/** Soft-link SupportClient by clientKey (create if missing). */
export async function upsertSupportClientByKey(
  clientKey: string,
  opts?: { label?: string; property?: string }
): Promise<{ id: string; clientKey: string }> {
  const client = await db.supportClient.upsert({
    where: { clientKey },
    create: {
      clientKey,
      label: opts?.label ?? clientKey,
      property: opts?.property ?? null,
    },
    update: {
      ...(opts?.label ? { label: opts.label } : {}),
      ...(opts?.property ? { property: opts.property } : {}),
    },
  })
  return { id: client.id, clientKey: client.clientKey }
}

export async function touchStreamConnected(clientKey: string): Promise<void> {
  await db.supportClient.updateMany({
    where: { clientKey },
    data: { lastStreamAt: new Date() },
  })
}
