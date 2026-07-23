#!/usr/bin/env node
/**
 * Best-effort pre-deploy snapshot: runs in the Render start command BEFORE
 * `prisma migrate deploy`, so every deploy that might mutate the schema has a
 * moments-old rollback point (`predeploy-YYYY-MM-DD-HHmm` Neon branch).
 *
 * ALWAYS exits 0 — a snapshot failure must never block a deploy; it logs
 * loudly instead (Render deploy logs are polled by ops-poll).
 * Prunes predeploy-* branches older than PREDEPLOY_RETENTION_DAYS (default 7).
 */

const apiKey = process.env.NEON_API_KEY
const projectId = process.env.NEON_PROJECT_ID
const retentionDays = Number(process.env.PREDEPLOY_RETENTION_DAYS ?? 7)

async function main() {
  if (!apiKey || !projectId) {
    console.log('[predeploy-snapshot] NEON_API_KEY / NEON_PROJECT_ID not set — skipping')
    return
  }
  const API = `https://console.neon.tech/api/v2/projects/${projectId}`
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const neon = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`Neon ${method} ${path} → ${res.status}`)
    return res.json()
  }

  const p = (n) => String(n).padStart(2, '0')
  const d = new Date()
  const name = `predeploy-${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
  await neon('POST', '/branches', { branch: { name } })
  console.log(`[predeploy-snapshot] created rollback point ${name}`)

  const { branches = [] } = await neon('GET', '/branches')
  const cutoff = Date.now() - retentionDays * 86_400_000
  for (const b of branches) {
    if (!b.name?.startsWith('predeploy-') || b.name === name) continue
    const createdAt = Date.parse(b.created_at ?? '')
    if (Number.isFinite(createdAt) && createdAt < cutoff) {
      await neon('DELETE', `/branches/${b.id}`).catch(() => {})
      console.log(`[predeploy-snapshot] pruned ${b.name}`)
    }
  }
}

main()
  .catch((err) => console.error('[predeploy-snapshot] non-blocking failure:', err.message))
  .finally(() => process.exit(0))
