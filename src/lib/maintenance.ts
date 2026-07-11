import type { MaintenanceNotice } from '@prisma/client'
import { db } from '@/lib/db'
import { raiseAlert } from '@/lib/alerts'
import { publishRelayEvent } from '@/lib/relay-outbox'
import type {
  MaintenanceNoticePayload,
  MaintenanceNoticeView,
  MaintenanceSeverity,
  MaintenanceStatus,
  MaintenanceTargetScope,
} from '@/types/maintenance'

export function toMaintenanceView(row: MaintenanceNotice): MaintenanceNoticeView {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    severity: row.severity as MaintenanceSeverity,
    status: row.status as MaintenanceStatus,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    windowStart: row.windowStart?.toISOString() ?? null,
    windowEnd: row.windowEnd?.toISOString() ?? null,
    targetScope: row.targetScope as MaintenanceTargetScope,
    targetValue: row.targetValue,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function mapSeverityToShowMessage(
  severity: MaintenanceSeverity
): 'info' | 'warning' | 'error' {
  if (severity === 'CRITICAL') return 'error'
  if (severity === 'WARN') return 'warning'
  return 'info'
}

/** Resolve clientKeys for a notice target. */
export async function resolveTargetClientKeys(
  scope: MaintenanceTargetScope,
  value: string | null | undefined
): Promise<string[]> {
  if (scope === 'CLIENT_KEY') {
    const key = value?.trim()
    if (!key) return []
    const client = await db.supportClient.findUnique({ where: { clientKey: key } })
    return client ? [client.clientKey] : [key]
  }

  if (scope === 'PROPERTY') {
    const property = value?.trim()
    if (!property) return []
    const clients = await db.supportClient.findMany({
      where: { property: { equals: property, mode: 'insensitive' } },
      select: { clientKey: true },
    })
    return clients.map((c) => c.clientKey)
  }

  const all = await db.supportClient.findMany({ select: { clientKey: true } })
  return all.map((c) => c.clientKey)
}

function buildPayload(row: MaintenanceNotice): MaintenanceNoticePayload {
  return {
    type: 'maintenance_notice',
    noticeId: row.id,
    title: row.title,
    body: row.body,
    severity: mapSeverityToShowMessage(row.severity as MaintenanceSeverity),
    windowStart: row.windowStart?.toISOString() ?? null,
    windowEnd: row.windowEnd?.toISOString() ?? null,
  }
}

/**
 * Deliver a notice to resolved pilots via RelayOutbox (maintenance_notice +
 * show_message for older clients), mark SENT, and alert William.
 */
export async function sendMaintenanceNotice(noticeId: string): Promise<{
  notice: MaintenanceNoticeView
  clientKeys: string[]
  delivered: number
}> {
  const row = await db.maintenanceNotice.findUnique({ where: { id: noticeId } })
  if (!row) throw new Error('Notice not found')
  if (row.status === 'CANCELLED') throw new Error('Notice is cancelled')
  if (row.status === 'SENT') throw new Error('Notice already sent')

  const clientKeys = await resolveTargetClientKeys(
    row.targetScope as MaintenanceTargetScope,
    row.targetValue
  )

  const payload = buildPayload(row)
  const showSeverity = payload.severity

  for (const clientKey of clientKeys) {
    await publishRelayEvent(clientKey, 'maintenance_notice', payload as unknown as Record<string, unknown>)
    await publishRelayEvent(clientKey, 'show_message', {
      type: 'show_message',
      title: row.title,
      body: row.body,
      severity: showSeverity,
      noticeId: row.id,
    })
    await publishRelayEvent(clientKey, 'directive', {
      ...payload,
    })
  }

  const updated = await db.maintenanceNotice.update({
    where: { id: noticeId },
    data: { status: 'SENT', sentAt: new Date() },
  })

  await raiseAlert({
    kind: 'system',
    severity: row.severity as MaintenanceSeverity,
    title: `Maintenance notice sent: ${row.title}`,
    body: `Delivered to ${clientKeys.length} pilot(s) · scope ${row.targetScope}${
      row.targetValue ? `=${row.targetValue}` : ''
    }`,
    entityRef: row.id,
    url: '/maintenance',
  })

  return {
    notice: toMaintenanceView(updated),
    clientKeys,
    delivered: clientKeys.length,
  }
}

/** Send all SCHEDULED notices whose scheduledFor <= now. */
export async function dispatchDueMaintenanceNotices(): Promise<{
  sent: string[]
  errors: Array<{ id: string; error: string }>
}> {
  const due = await db.maintenanceNotice.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledFor: { lte: new Date() },
    },
    orderBy: { scheduledFor: 'asc' },
  })

  const sent: string[] = []
  const errors: Array<{ id: string; error: string }> = []

  for (const row of due) {
    try {
      await sendMaintenanceNotice(row.id)
      sent.push(row.id)
    } catch (e) {
      errors.push({
        id: row.id,
        error: e instanceof Error ? e.message : 'Send failed',
      })
    }
  }

  return { sent, errors }
}
