/**
 * Lightweight Help Desk intake smoke — not a full k6 suite.
 *
 * Usage:
 *   WEB_SERVICE_URL=https://echoaurion-company-os.onrender.com \
 *   SUPPORT_INGEST_SECRET=... \
 *   node scripts/smoke-help-desk-load.mjs
 *
 * Sends N questions across M clientKeys, reports 201 vs 429 vs errors + p95 latency.
 * Does NOT wait for knight worker completion — check Help Desk queue separately.
 *
 * Heavier burst: scripts/load-help-desk-burst.mjs
 */

const base = (
  process.env.WEB_SERVICE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.NEXTAUTH_URL ||
  'http://localhost:3000'
)
  .trim()
  .replace(/\/$/, '')

const secret = process.env.SUPPORT_INGEST_SECRET?.trim()
const total = Math.min(Number(process.env.SMOKE_QUESTIONS ?? 25), 100)
const clients = Math.min(Number(process.env.SMOKE_CLIENT_KEYS ?? 5), 20)

if (!secret) {
  console.error('[smoke] Set SUPPORT_INGEST_SECRET')
  process.exit(1)
}

function clientKey(i) {
  return `smoke-load-${i % clients}-${Date.now()}`
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

async function postQuestion(i) {
  const url = `${base}/api/relay/questions`
  const t0 = performance.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientKey: clientKey(i),
      question: `[smoke ${i}] How do I reset a room status? (${new Date().toISOString()})`,
      gate: 'TECH',
    }),
  })
  const ms = performance.now() - t0
  const body = await res.text().catch(() => '')
  return { status: res.status, body: body.slice(0, 200), ms }
}

console.log(`[smoke] POST ${total} questions → ${base} (${clients} clientKeys)`)

const results = { ok: 0, throttled: 0, error: 0 }
const latencies = []
const started = Date.now()

await Promise.all(
  Array.from({ length: total }, (_, i) =>
    postQuestion(i).then((r) => {
      latencies.push(r.ms)
      if (r.status === 201) results.ok += 1
      else if (r.status === 429) results.throttled += 1
      else results.error += 1
      if (i < 3 || r.status !== 201) {
        console.log(`  [${i}] HTTP ${r.status} ${r.ms.toFixed(0)}ms ${r.body}`)
      }
    })
  )
)

const elapsed = ((Date.now() - started) / 1000).toFixed(1)
const sorted = [...latencies].sort((a, b) => a - b)
const p95 = percentile(sorted, 95).toFixed(0)

console.log(
  `[smoke] Done in ${elapsed}s — 201: ${results.ok} · 429: ${results.throttled} · other: ${results.error}`
)
console.log(`[smoke] intake p95: ${p95}ms (not SLA — run load-help-desk-burst.mjs for fleet sim)`)
console.log('[smoke] Knight backlog: POST /api/ops/drain-knight-queue (CRON_SECRET) or wait for knight-drain cron')

process.exit(results.error > 0 ? 1 : 0)
