/**
 * Dr. OS "config debt" — panels that are red because Render env vars are
 * missing, not because of an exception flywheel. Knights cannot paste secrets;
 * these items are for William in the Render dashboard.
 *
 * Creates at most one SYSTEM ticket per UTC day (deduped). Does NOT queue
 * agent/Knights — priority LOW + USER scope + no INFRA/AUTH/API category.
 */

import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { ConfigDebtHealth, ConfigDebtItem, DrOsStatus } from '@/types/dr-os'

export type { ConfigDebtItem }

/** Status panels needed to collect debt — configDebt itself is excluded. */
export type StatusForConfigDebt = Omit<DrOsStatus, 'configDebt'>

export type ConfigDebtSnapshot = ConfigDebtHealth

const CLIENT_KEY = 'company-os/config-debt'

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function fingerprintForDay(day: string): string {
  return `ops-config-debt-${createHash('sha256').update(day).digest('hex').slice(0, 24)}`
}

/** Collect not-configured / missing-secret panels from a status payload. */
export function collectConfigDebt(status: StatusForConfigDebt): ConfigDebtItem[] {
  const items: ConfigDebtItem[] = []

  for (const repo of status.github) {
    const err = (repo.error ?? '').toLowerCase()
    if (
      err.includes('token') ||
      err.includes('not set') ||
      err.includes('401') ||
      err.includes('403') ||
      err.includes('404') ||
      err.includes('repo read')
    ) {
      items.push({
        panel: `GitHub · ${repo.repo.split('/')[1] ?? repo.repo}`,
        reason: repo.error ?? 'GitHub unreachable',
        envVars: ['GITHUB_TOKEN'],
      })
    }
  }

  if (
    status.render.error?.toLowerCase().includes('not configured') ||
    (!process.env.RENDER_API_KEY?.trim() || !process.env.RENDER_SERVICE_ID?.trim())
  ) {
    if (
      status.render.label === 'Not configured' ||
      status.render.error?.toLowerCase().includes('not configured')
    ) {
      items.push({
        panel: 'Render Deploy',
        reason: status.render.error ?? 'Render API not configured',
        envVars: ['RENDER_API_KEY', 'RENDER_SERVICE_ID'],
      })
    }
  }

  if (
    status.stripe.error?.toLowerCase().includes('not configured') ||
    status.stripe.label === 'Not configured'
  ) {
    items.push({
      panel: 'Stripe MRR',
      reason: status.stripe.error ?? 'STRIPE_SECRET_KEY not set',
      envVars: ['STRIPE_SECRET_KEY'],
    })
  }

  if (
    status.activeUsers.error?.includes('PRODUCT_DATABASE_URL') ||
    status.activeUsers.label === 'Not configured'
  ) {
    items.push({
      panel: 'Active Users',
      reason: status.activeUsers.error ?? 'PRODUCT_DATABASE_URL not set',
      envVars: ['PRODUCT_DATABASE_URL'],
    })
  }

  const pc = status.pilotConnection
  if (!pc.supportIngestSecretConfigured) {
    items.push({
      panel: 'Connection health · ingest secret',
      reason: 'SUPPORT_INGEST_SECRET unset — pilot relay cannot authenticate',
      envVars: ['SUPPORT_INGEST_SECRET'],
    })
  }
  if (!pc.echoAiConfigured) {
    items.push({
      panel: "Connection health · Chef's Brain URL",
      reason: 'ECHO_AI_URL unset — paste luccca-web echo-brain URL on Render',
      envVars: ['ECHO_AI_URL', 'ECHO_AI_KEY'],
    })
  } else if (!pc.chefsBrainConfigured) {
    items.push({
      panel: "Connection health · Chef's Brain probe",
      reason: pc.chefsBrainDetail ?? 'ECHO_AI_URL set but probe failed',
      envVars: ['ECHO_AI_URL', 'ECHO_AI_KEY'],
    })
  }

  // Dedupe by panel key
  const seen = new Set<string>()
  return items.filter((i) => {
    if (seen.has(i.panel)) return false
    seen.add(i.panel)
    return true
  })
}

/**
 * Ensure at most one open SYSTEM config-debt ticket per UTC day.
 * Never queues Knights / agent_loop (LOW + USER + UNKNOWN category).
 */
export async function ensureConfigDebtTicket(
  items: ConfigDebtItem[]
): Promise<{ ticketId: string | null; created: boolean }> {
  if (items.length === 0) {
    return { ticketId: null, created: false }
  }

  const day = utcDayKey()
  const fingerprint = fingerprintForDay(day)

  const existing = await db.helpTicket.findFirst({
    where: {
      channel: 'SYSTEM',
      fingerprint,
      clientKey: CLIENT_KEY,
      status: { in: ['OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })

  const bodyLines = [
    'Dr. OS config debt — env/config only. Knights cannot set Render secrets.',
    'William: paste the listed vars on echoaurion-company-os → Environment, then redeploy.',
    `Day (UTC): ${day}`,
    '',
    ...items.map(
      (i) => `• ${i.panel}: ${i.reason} → ${i.envVars.join(', ')}`
    ),
    '',
    'See docs/DR_OS_COMPLETE.md § Panel → env checklist and docs/OPEN_OPS_CHECKLIST.md.',
  ]

  if (existing) {
    // Already have today's ticket — do not spam messages on every 60s Dr. OS poll.
    return { ticketId: existing.id, created: false }
  }

  const ticket = await db.helpTicket.create({
    data: {
      channel: 'SYSTEM',
      status: 'OPEN',
      priority: 'LOW',
      subject: `[SYSTEM] Dr. OS config debt (${items.length} panel${items.length === 1 ? '' : 's'})`,
      clientKey: CLIENT_KEY,
      errorScope: 'USER',
      errorCategory: 'UNKNOWN',
      productLine: 'company-os',
      fingerprint,
      occurrenceCount: 1,
      affectedClientKeys: [CLIENT_KEY],
      lastOccurredAt: new Date(),
      notifyWhenFixed: false,
      moduleHint: 'dr-os-config-debt',
      errorClass: 'ConfigDebt',
      agentWorking: false,
      needsHumanCoreReview: true,
      messages: {
        create: [{ role: 'SYSTEM', body: bodyLines.join('\n').slice(0, 4000) }],
      },
    },
    select: { id: true },
  })

  await audit('computer_agent', 'dr_os.config_debt.ticket', ticket.id, {
    day,
    panels: items.map((i) => i.panel),
    envVars: Array.from(new Set(items.flatMap((i) => i.envVars))),
  })

  return { ticketId: ticket.id, created: true }
}

/** Build snapshot + optionally open/refresh the daily ticket (non-blocking safe). */
export async function getConfigDebtSnapshot(
  status: StatusForConfigDebt,
  opts?: { openTicket?: boolean }
): Promise<ConfigDebtSnapshot> {
  const items = collectConfigDebt(status)
  let ticketId: string | null = null
  let ticketCreated = false
  if (opts?.openTicket !== false && items.length > 0) {
    try {
      const r = await ensureConfigDebtTicket(items)
      ticketId = r.ticketId
      ticketCreated = r.created
    } catch {
      // Ticket path must never blank Dr. OS
    }
  }
  return {
    items,
    ticketId,
    ticketCreated,
    generatedAt: new Date().toISOString(),
  }
}
