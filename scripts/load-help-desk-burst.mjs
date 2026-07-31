/**
 * Multi-clientKey burst load harness — locust-lite (no k6 install required).
 *
 * Simulates many distinct clientKeys posting questions in parallel.
 * Reports intake latency percentiles + 201/429/error counts.
 * Does NOT prove SLA — run against staging and inspect knight backlog separately.
 *
 * Usage (staging):
 *   WEB_SERVICE_URL=https://echoaurion-company-os.onrender.com \
 *   SUPPORT_INGEST_SECRET=... \
 *   node scripts/load-help-desk-burst.mjs
 *
 * Optional tuning:
 *   BURST_CLIENT_KEYS=100   — distinct clientKeys (default 50, max 200)
 *   BURST_PER_CLIENT=3      — POSTs per clientKey (default 2, max 10)
 *   BURST_CONCURRENCY=40    — in-flight requests (default 30, max 100)
 *   CRON_SECRET=...         — if set, probes knight queue depth after burst
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
const cronSecret = process.env.CRON_SECRET?.trim()
const clientKeys = Math.min(Number(process.env.BURST_CLIENT_KEYS ?? 50), 200)
const perClient = Math.min(Number(process.env.BURST_PER_CLIENT ?? 2), 10)
const concurrency = Math.min(Number(process.env.BURST_CONCURRENCY ?? 30), 100)
const runId = Date.now()

if (!secret) {
  console.error('[burst] Set SUPPORT_INGEST_SECRET')
  process.exit(1)
}

function clientKey(i) {
  return `burst-${runId}-${i % clientKeys}`
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

async function postQuestion(seq, clientIdx) {
  const url = `${base}/api/relay/questions`
  const t0 = performance.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientKey: clientKey(clientIdx),
      question: `[burst ${seq}] Room status reset procedure? (${new Date().toISOString()})`,
      gate: 'TECH',
    }),
  })
  const ms = performance.now() - t0
  const body = await res.text().catch(() => '')
  return { status: res.status, ms, body: body.slice(0, 120) }
}

async function probeKnightQueue() {
  if (!cronSecret) return null
  const res = await fetch(`${base}/api/ops/drain-knight-queue`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cronSecret}` },
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

const total = clientKeys * perClient
console.log(
  `[burst] ${total} POSTs · ${clientKeys} clientKeys × ${perClient} · concurrency ${concurrency} → ${base}`
)

const latencies = []
const results = { ok: 0, throttled: 0, error: 0 }
const started = Date.now()
let nextSeq = 0

async function worker() {
  while (true) {
    const seq = nextSeq
    nextSeq += 1
    if (seq >= total) break
    const clientIdx = Math.floor(seq / perClient)
    try {
      const r = await postQuestion(seq, clientIdx)
      latencies.push(r.ms)
      if (r.status === 201) results.ok += 1
      else if (r.status === 429) results.throttled += 1
      else {
        results.error += 1
        if (results.error <= 5) console.log(`  [err ${seq}] HTTP ${r.status} ${r.body}`)
      }
    } catch (e) {
      results.error += 1
      if (results.error <= 5) console.log(`  [err ${seq}] ${e instanceof Error ? e.message : e}`)
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()))

const elapsed = ((Date.now() - started) / 1000).toFixed(1)
const sorted = [...latencies].sort((a, b) => a - b)
const p50 = percentile(sorted, 50).toFixed(0)
const p95 = percentile(sorted, 95).toFixed(0)
const p99 = percentile(sorted, 99).toFixed(0)

console.log(`[burst] Done in ${elapsed}s`)
console.log(`  201: ${results.ok} · 429: ${results.throttled} · other: ${results.error}`)
console.log(`  intake latency ms — p50: ${p50} · p95: ${p95} · p99: ${p99} · max: ${sorted.at(-1)?.toFixed(0) ?? '—'}`)
console.log('[burst] Knight completion NOT measured — check Help Desk + ingest_jobs text_knights')

if (cronSecret) {
  const probe = await probeKnightQueue()
  if (probe?.json?.success && probe.json.data) {
    const d = probe.json.data
    console.log(
      `[burst] Knight probe — pending: ${d.stats?.knightPending ?? '?'} · done this run: ${d.done ?? '?'} · label: ${d.label ?? '—'}`
    )
  } else {
    console.log(`[burst] Knight probe HTTP ${probe?.status ?? 'skip'}`)
  }
} else {
  console.log('[burst] Set CRON_SECRET to probe knight queue after burst')
}

process.exit(results.error > 0 ? 1 : 0)
