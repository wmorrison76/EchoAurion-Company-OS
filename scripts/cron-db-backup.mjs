#!/usr/bin/env node
/**
 * Nightly database snapshot via Neon branch API.
 *
 * Creates a copy-on-write branch named `backup-YYYY-MM-DD-HHmm` (storage-only,
 * no compute endpoint — costs pennies) and prunes backup-* branches older than
 * BACKUP_RETENTION_DAYS (default 30).
 *
 * Env: NEON_API_KEY, NEON_PROJECT_ID, BACKUP_RETENTION_DAYS?
 * Behavior mirrors the other cron scripts: missing config → log skip, exit 0
 * (so an unconfigured environment never shows a red cron), API failure →
 * exit 1 so Render surfaces the failed run (which ops-poll then tickets).
 *
 * Restore procedure: docs/RESTORE_RUNBOOK.md
 */

const apiKey = process.env.NEON_API_KEY
const projectId = process.env.NEON_PROJECT_ID
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30)

if (!apiKey || !projectId) {
  console.log('[db-backup] NEON_API_KEY / NEON_PROJECT_ID not set — skipping (exit 0)')
  process.exit(0)
}

const API = `https://console.neon.tech/api/v2/projects/${projectId}`
const headers = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

async function neon(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Neon ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}`
}

async function main() {
  const name = `backup-${stamp(new Date())}`
  const created = await neon('POST', '/branches', { branch: { name } })
  console.log(`[db-backup] created snapshot branch ${name} (${created.branch?.id ?? 'unknown id'})`)

  const { branches = [] } = await neon('GET', '/branches')
  const cutoff = Date.now() - retentionDays * 86_400_000
  let pruned = 0
  for (const b of branches) {
    if (!b.name?.startsWith('backup-')) continue
    if (b.name === name) continue
    const createdAt = Date.parse(b.created_at ?? '')
    if (Number.isFinite(createdAt) && createdAt < cutoff) {
      await neon('DELETE', `/branches/${b.id}`)
      pruned += 1
      console.log(`[db-backup] pruned expired snapshot ${b.name}`)
    }
  }
  const kept = branches.filter((b) => b.name?.startsWith('backup-')).length - pruned + 1
  console.log(`[db-backup] done — retention ${retentionDays}d, ~${kept} snapshots retained`)
}

main().catch((err) => {
  console.error('[db-backup] FAILED:', err.message)
  process.exit(1)
})
