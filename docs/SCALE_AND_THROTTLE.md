# Scale & Throttle — 5,000-tenant burst + 100-enterprise readiness

**Branch:** `claude/vigilant-rubin-DtQE3`  
**Goal:** Company OS must not collapse when ~5,000 SupportClients (or CI/deploy webhooks) stampede error-events, self-reports, knowledge ingest, or Help Desk relay questions at once.

**Honest status:** P0 + P1 architecture is **shipped in-repo**. **100-enterprise SLA is not proven** — William must run `scripts/load-help-desk-burst.mjs` against staging and review p95 intake + knight backlog before claiming fleet readiness.

---

## Threat model

| Burst | Without protection | With protection |
|---|---|---|
| 5k identical LanguageProvider crashes | 5k tickets + 5k Knight convenes | **1 ticket** + `occurrenceCount` bump; agent loop **queued once** |
| 5k distinct fingerprints | Sync LLM + DB exhaustion | Per-client + global **429**; agent work **queued** and drained slowly |
| 100 orgs × questions/min | Inline knights on web → OOM / 504 | **202-fast intake** + `text_knights` job queue + knight worker cron |
| GLOBAL resolve notify | Sync loop over 5k `RelayOutbox` writes | **Chunked fan-out** (40/chunk) via `ingest_jobs` |
| GitHub webhook storm | Request pile-up | Signature verify + webhook budget + poll backup |
| Multi-instance SSE | Live events only on publishing replica | **Upstash Redis Stream** fan-out (`relay-pubsub-redis.ts`) + outbox flush on reconnect |

---

## P0 shipped (`3124b98`)

### 1. TEXT Knights queued (`text_knights` / `src/lib/ingest-queue.ts`)

| Step | Behavior |
|---|---|
| `POST /api/relay/questions` | Creates `CustomerQuestion` + HelpTicket **sync** (<200ms target) |
| Knights | **Enqueued** as `text_knights` with dedupe `knights:{ticketId}` |
| Worker | `POST /api/ops/drain-knight-queue` — cron **every 1 min** (P1 hardened) |
| Concurrency | `KNIGHT_WORKER_CONCURRENCY` (default **4**) via `withKnightSlot` |
| Manual convene | William "Ask Knights" shares same semaphore — protects LLM budget |

Intake response includes `knightsQueued: true` when a job was created.

### 2. Per-`clientKey` + global question rate limits

| Scope | Default / minute | Env override |
|---|---|---|
| Per `clientKey` | 20 | `RATE_QUESTIONS_PER_CLIENT` |
| Global (all tenants) | 600 | `RATE_QUESTIONS_GLOBAL` |
| Per source IP (leaked secret) | 60 | `RATE_QUESTIONS_PER_IP` |

Implementation: `allowIngestThrottleAsync` in `src/lib/rate-limit.ts` + `relayQuestionsThrottle` in `src/lib/relay-auth.ts`.

**Upstash (optional):** When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, question budgets use Redis REST counters shared across Render instances. Otherwise in-memory per instance (documented fallback).

### 3. Dedicated knight worker cron

```yaml
# render.yaml — every 1 minute (P1)
echoaurion-company-os-knight-drain
  → node scripts/cron-knight-drain.mjs
  → POST /api/ops/drain-knight-queue
```

`echoaurion-company-os-ops-poll` (5 min) still drains SYSTEM jobs (`agent_loop`, notify, learning) — **not** a substitute for knight drain.

Render has no separate "background worker" service type — **this cron is the worker**. Optional future: duplicate cron in a second region for redundancy.

### 4. Render blueprint + Neon notes

| Item | Blueprint / doc |
|---|---|
| Web plan | **`plan: standard`** (512MB) — Starter OOMs under knight + SSE + admin |
| Knight env | `KNIGHT_WORKER_BATCH=8`, `KNIGHT_WORKER_CONCURRENCY=4` |
| Question env | `RATE_QUESTIONS_*` in `render.yaml` |
| Neon pool | `connection_limit=10` on pooled URL; see DEPLOY.md §1 + `.env.example` |
| Standby caps | `STANDBY_MAX_AUTO_PER_HOUR=60`, `STANDBY_MAX_AUTO_PER_CLIENT_PER_HOUR=8` |

### 5. Standby auto-send caps (HELP_DESK_AUTO_APPROVE through Aug 31 2026)

| Cap | Default | Notes |
|---|---|---|
| Global `/hour` | **60** (was 10) | `STANDBY_MAX_AUTO_PER_HOUR` |
| Per `clientKey` `/hour` | **8** | `STANDBY_MAX_AUTO_PER_CLIENT_PER_HOUR` |
| Dev fast-path | Bypasses hourly cap | `HELP_DESK_AUTO_APPROVE` + `ECHO_AUTO_APPROVE` still subject to BUILD/core/code guards |

### 6. Smoke harness (not load test)

```bash
WEB_SERVICE_URL=https://… SUPPORT_INGEST_SECRET=… node scripts/smoke-help-desk-load.mjs
```

Reports 201 vs 429 + p95 intake latency. Does **not** validate knight completion latency.

---

## P1 shipped (this branch, post-`3124b98`)

### 1. Redis SSE fan-out (`src/lib/relay-pubsub-redis.ts`)

| Mode | Behavior |
|---|---|
| Upstash set | `publishRelayEvent` → `XADD relay:fanout` → each web replica polls `XREAD` → local `EventEmitter` |
| Upstash unset | In-process bus only (single-instance OK) |
| Reconnect safety | `/api/relay/stream` still flushes undelivered `RelayOutbox` on connect |

**Requires William:** Create Upstash Redis → paste REST URL + token on web env **before** scaling web to 2+ instances.

### 2. Load / burst harness

| Script | Purpose |
|---|---|
| `scripts/smoke-help-desk-load.mjs` | Quick smoke — 25 POSTs, p95 latency |
| `scripts/load-help-desk-burst.mjs` | Fleet sim — 50–200 clientKeys, parallel burst, p50/p95/p99, optional knight probe |

```bash
# Staging burst (example — tune env vars)
WEB_SERVICE_URL=https://echoaurion-company-os.onrender.com \
SUPPORT_INGEST_SECRET=… \
BURST_CLIENT_KEYS=100 BURST_PER_CLIENT=2 BURST_CONCURRENCY=40 \
CRON_SECRET=… \
node scripts/load-help-desk-burst.mjs
```

**No SLA numbers in-repo** until William runs this and records results.

### 3. Knight worker hardened

| Change | Value |
|---|---|
| Cron interval | **1 min** (was 2 min) |
| Default batch | **8** (was 5) |
| Default concurrency | **4** (was 3) |

Tune down if LLM budget tight; tune up only after load test shows backlog growth.

### 4. Neon connection_limit guidance

- `.env.example` — `connection_limit` on pooled `DATABASE_URL`
- `DEPLOY.md` §1 — pool budget table per web/cron instance
- Dr. OS Neon panel — reads `connection_limit` from URL when present

### 5. Dr. OS knight queue visibility

`DeadLetterDrainChip` + `/api/dr-os/drain-health` now show:

- `Knights queued: N` / `Knights running: N`
- `Knight drain: Xm ago` (stale if >3 min with backlog)

Shape + label + count — colorblind-safe via `StatusBadge`.

---

## Error ingest (unchanged — already shipped)

### Rate limits (`src/lib/rate-limit.ts`)

| Scope | Default / minute |
|---|---|
| Error ingest per `clientKey` | 30 |
| Error ingest global | 400 |
| Knowledge per client | 60 |
| Knowledge global | 200 |

### Async job queue (`IngestJob`)

Kinds: `agent_loop` · `notify_fanout` · `knowledge_embed` · `echo_learn_*` · **`text_knights`**

- Dedupe key prevents double-queue.
- Drained by ops-poll (SYSTEM) + knight-drain (TEXT).

---

## Help Desk capacity model (post-P1, single Standard web)

| Metric | Estimate |
|---|---|
| Intake | **600 questions/min global**, **20/min per clientKey** (+ IP cap 60) |
| Knight worker throughput | ~**8 jobs / min** default batch × ~60s/knight ≈ **8 tickets/min sustained** (concurrency-limited to 4 parallel) |
| Concurrent LLM dispatches | **≤4** (`KNIGHT_WORKER_CONCURRENCY`) |
| Backlog growth | If intake > drain → `ingest_jobs` `text_knights` pending rises; watch Dr. OS chip |

**To reach ~100 enterprises:** load test first, then raise batch/concurrency, add second knight-drain region, or shorten cron further — **do not extrapolate**.

---

## Done vs remaining — 100-enterprise SLA

### Done (P0 + P1 in-repo)

- [x] Queue TEXT knights through `ingest_jobs`
- [x] Fast intake on relay questions (no inline LLM on web path)
- [x] Per-`clientKey` + global question rate limits
- [x] Optional Upstash Redis for shared rate limits
- [x] Dedicated knight drain cron (**1 min**, batch 8, concurrency 4)
- [x] Bounded knight concurrency semaphore
- [x] Standby global + per-client hourly caps raised/documented
- [x] `render.yaml` Standard plan + scale env vars
- [x] Smoke + burst load harness scripts
- [x] Redis SSE fan-out via Upstash Streams
- [x] Neon `connection_limit` guidance (`.env.example`, DEPLOY.md)
- [x] Dr. OS knight queue depth + drain freshness chip
- [x] This doc updated

### Remaining (P2 — before claiming 100-enterprise SLA)

- [ ] **William runs load test** on staging — record p95 intake + p95 time-to-answer + max knight backlog
- [ ] **Upstash keys on Render** — required for 2+ web instances (rate limits + SSE)
- [ ] **Confirm Standard plan + knight-drain cron enabled** in Render dashboard
- [ ] **Neon headroom verified** — dashboard connection count under limit during burst
- [ ] **Horizontal web autoscale** — only after Upstash + load numbers justify it
- [ ] **Second knight-drain region** — optional redundancy for worker cron
- [ ] **Read replica** — analytics only; not on hot path

---

## Operator checklist

- [ ] Deploy branch; confirm web plan **Standard** in Render dashboard
- [ ] Confirm cron `echoaurion-company-os-knight-drain` enabled (**every 1 min**)
- [ ] Confirm cron `ops-poll` still running (SYSTEM jobs)
- [ ] Optional but required for multi-instance: Upstash Redis REST URL + token on web
- [ ] Set Neon pooled URL with `connection_limit=10` (or lower if limit tight)
- [ ] Run smoke script against staging; inspect `ingest_jobs` where `kind=text_knights`
- [ ] Run burst script; record results — **do not extrapolate** from smoke alone
- [ ] Dr. OS → Dead-letter drain chip → verify knight drain freshness

---

## Render clicks for William

1. **Dashboard → echoaurion-company-os → Settings → Instance type → Standard**
2. **Environment → verify/add:**
   - `RATE_QUESTIONS_PER_CLIENT=20`
   - `RATE_QUESTIONS_GLOBAL=600`
   - `STANDBY_MAX_AUTO_PER_HOUR=60`
   - `STANDBY_MAX_AUTO_PER_CLIENT_PER_HOUR=8`
   - `KNIGHT_WORKER_BATCH=8`
   - `KNIGHT_WORKER_CONCURRENCY=4`
   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (before 2+ web instances)
3. **Cron jobs → confirm `echoaurion-company-os-knight-drain`** is enabled (every **1 min**)
4. **Neon console → append `connection_limit=10` to pooled DATABASE_URL** on Render
5. **Load test:** run `scripts/load-help-desk-burst.mjs` against staging URL

---

## Hot-path HTTP semantics

| Path | Success | Throttle |
|---|---|---|
| `/api/relay/error-events` | `201` / `202` dedupe | `429` per client + global |
| `/api/relay/questions` | `201` + `knightsQueued` | `429` per client + global + IP |
| `/api/help-desk/self-report` | `201` / `202` | `429` |
| `/api/knowledge/ingest` | `202` | `429` |

All throttle bodies include `code: RATE_LIMITED` and a **shape+label** string (colorblind-safe).
