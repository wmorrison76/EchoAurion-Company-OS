# Scale & Throttle — 5,000-tenant burst + 100-enterprise readiness

**Branch:** `claude/vigilant-rubin-DtQE3`  
**Goal:** Company OS must not collapse when ~5,000 SupportClients (or CI/deploy webhooks) stampede error-events, self-reports, knowledge ingest, or Help Desk relay questions at once.

**Honest status:** Architecture for fleet scale is **shipped in-repo**. **100-enterprise SLA is not proven** — run `scripts/smoke-help-desk-load.mjs` then a proper load test before claiming readiness.

---

## Threat model

| Burst | Without protection | With protection |
|---|---|---|
| 5k identical LanguageProvider crashes | 5k tickets + 5k Knight convenes | **1 ticket** + `occurrenceCount` bump; agent loop **queued once** |
| 5k distinct fingerprints | Sync LLM + DB exhaustion | Per-client + global **429**; agent work **queued** and drained slowly |
| 100 orgs × questions/min | Inline knights on web → OOM / 504 | **202-fast intake** + `text_knights` job queue + knight worker cron |
| GLOBAL resolve notify | Sync loop over 5k `RelayOutbox` writes | **Chunked fan-out** (40/chunk) via `ingest_jobs` |
| GitHub webhook storm | Request pile-up | Signature verify + webhook budget + poll backup |

---

## P0 shipped (this branch)

### 1. TEXT Knights queued (`text_knights` / `src/lib/ingest-queue.ts`)

| Step | Behavior |
|---|---|
| `POST /api/relay/questions` | Creates `CustomerQuestion` + HelpTicket **sync** (<200ms target) |
| Knights | **Enqueued** as `text_knights` with dedupe `knights:{ticketId}` |
| Worker | `POST /api/ops/drain-knight-queue` — cron **every 2 min** |
| Concurrency | `KNIGHT_WORKER_CONCURRENCY` (default **3**) via `withKnightSlot` |
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
# render.yaml — every 2 minutes
echoaurion-company-os-knight-drain
  → node scripts/cron-knight-drain.mjs
  → POST /api/ops/drain-knight-queue
```

`echoaurion-company-os-ops-poll` (5 min) still drains SYSTEM jobs (`agent_loop`, notify, learning) — **not** a substitute for knight drain.

### 4. Render blueprint + Neon notes

| Item | Blueprint / doc |
|---|---|
| Web plan | **`plan: standard`** (512MB) — Starter OOMs under knight + SSE + admin |
| Knight env | `KNIGHT_WORKER_BATCH=5`, `KNIGHT_WORKER_CONCURRENCY=3` |
| Question env | `RATE_QUESTIONS_*` in `render.yaml` |
| Neon pool | Keep Prisma pool **small** (default ~5–10). Never open a connection per client in fan-out — outbox batches already. Neon **connection_limit** on free/pro: size pool ≤ limit − 2 for cron overlap. See DEPLOY.md § Neon. |
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

Reports 201 vs 429 across N questions × M clientKeys. Does **not** validate knight completion latency — check Help Desk + `ingest_jobs` backlog.

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

## Help Desk capacity model (post-P0, single Standard web)

| Metric | Estimate |
|---|---|
| Intake | **600 questions/min global**, **20/min per clientKey** (+ IP cap 60) |
| Knight worker throughput | ~**5 jobs / 2 min** default batch × ~60s/knight ≈ **2.5 tickets/min sustained** per worker cron |
| Concurrent LLM dispatches | **≤3** (`KNIGHT_WORKER_CONCURRENCY`) |
| Backlog growth | If intake > drain → `ingest_jobs` `text_knights` pending rises; watch Dr. OS / `POST /api/ops/drain-knight-queue` stats |

**To reach ~100 enterprises:** raise `KNIGHT_WORKER_BATCH`, shorten knight-drain interval (1 min), add second worker region, or dedicated background worker service — **after** load test proves bottleneck.

---

## Done vs remaining — 100-enterprise SLA

### Done (P0 in-repo)

- [x] Queue TEXT knights through `ingest_jobs`
- [x] Fast intake on relay questions (no inline LLM on web path)
- [x] Per-`clientKey` + global question rate limits
- [x] Optional Upstash Redis for shared counters
- [x] Dedicated knight drain cron (2 min)
- [x] Bounded knight concurrency semaphore
- [x] Standby global + per-client hourly caps raised/documented
- [x] `render.yaml` Standard plan + scale env vars
- [x] Smoke harness script
- [x] This doc updated

### Remaining (P1 — before claiming 100-enterprise SLA)

- [ ] **Load test** — k6 or Locust: 100 clientKeys × burst questions, measure p95 intake + p95 time-to-answer
- [ ] **Redis SSE fan-out** — `/api/relay/stream` in-memory bus breaks multi-instance
- [ ] **Dedicated Render background worker** — optional split knight drain off web service entirely
- [ ] **Neon scale** — verify connection_limit + consider read replica for analytics only
- [ ] **Horizontal web** — requires Redis for rate limits + SSE; do not scale web replicas without Upstash
- [ ] **Autoscale knight workers** — queue depth → dynamic batch / second cron region

---

## Operator checklist

- [ ] Deploy branch; confirm web plan **Standard** in Render dashboard (Blueprint may require manual upgrade on existing service)
- [ ] Confirm cron `echoaurion-company-os-knight-drain` has `CRON_SECRET` + `WEB_SERVICE_URL`
- [ ] Confirm cron `ops-poll` still running (SYSTEM jobs)
- [ ] Optional: Upstash Redis for multi-instance rate limits
- [ ] Run smoke script against staging; inspect `ingest_jobs` where `kind=text_knights`
- [ ] Before enterprise fleet: full load test — **do not extrapolate** from smoke alone

---

## Render clicks for William

1. **Dashboard → echoaurion-company-os → Settings → Instance type → Standard** (if Blueprint did not apply upgrade).
2. **Environment → verify/add:**
   - `RATE_QUESTIONS_PER_CLIENT=20`
   - `RATE_QUESTIONS_GLOBAL=600`
   - `STANDBY_MAX_AUTO_PER_HOUR=60`
   - `STANDBY_MAX_AUTO_PER_CLIENT_PER_HOUR=8`
   - `KNIGHT_WORKER_BATCH=5`
   - `KNIGHT_WORKER_CONCURRENCY=3`
3. **Cron jobs → confirm `echoaurion-company-os-knight-drain`** is enabled (every 2 min).
4. **Neon console → Project → Connection details → note `connection_limit`** — keep total app connections under limit (web + crons).
5. **Optional:** Upstash → create Redis → paste REST URL + token into web env.

---

## Hot-path HTTP semantics

| Path | Success | Throttle |
|---|---|---|
| `/api/relay/error-events` | `201` / `202` dedupe | `429` per client + global |
| `/api/relay/questions` | `201` + `knightsQueued` | `429` per client + global + IP |
| `/api/help-desk/self-report` | `201` / `202` | `429` |
| `/api/knowledge/ingest` | `202` | `429` |

All throttle bodies include `code: RATE_LIMITED` and a **shape+label** string (colorblind-safe).
