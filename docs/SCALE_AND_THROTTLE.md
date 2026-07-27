# Scale & Throttle — 5,000-tenant burst design

**Branch:** `claude/vigilant-rubin-DtQE3`  
**Goal:** Company OS must not collapse when ~5,000 SupportClients (or CI/deploy webhooks) stampede error-events, self-reports, or knowledge ingest at once.

---

## Threat model

| Burst | Without protection | With protection |
|---|---|---|
| 5k identical LanguageProvider crashes | 5k tickets + 5k Knight convenes | **1 ticket** + `occurrenceCount` bump; agent loop **queued once** |
| 5k distinct fingerprints | Sync LLM + DB exhaustion | Per-client + global **429**; agent work **queued** and drained slowly |
| GLOBAL resolve notify | Sync loop over 5k `RelayOutbox` writes | **Chunked fan-out** (40/chunk) via `ingest_jobs` |
| GitHub webhook storm | Request pile-up | Signature verify + webhook budget + poll backup |

---

## What shipped (in-process + DB)

### 1. Rate limits (`src/lib/rate-limit.ts`)

| Scope | Default / minute | Response |
|---|---|---|
| Error ingest per `clientKey` | 30 | `429` + `Retry-After` + label `⚠ Throttled — client error budget` |
| Error ingest global | 400 | `⚠ Throttled — global error budget` |
| Knowledge per client | 60 | knowledge budget labels |
| Knowledge global | 200 | |
| Self-report | 20 | |
| GitHub webhook | 120 | |
| Ops poll | 6 | |

Overrides: `RATE_ERROR_PER_CLIENT`, `RATE_ERROR_GLOBAL`, etc.

**Note:** Buckets are **per Render instance**. Multi-instance → Redis/Upstash (next step, not blocking).

### 2. Aggressive fingerprint dedupe (`ingestErrorEvent`)

- Same `fingerprint` + open SYSTEM ticket within **1h** → increment `occurrenceCount`, append SYSTEM message, **no new ticket**.
- Indexes: `(fingerprint, status)`, `(fingerprint, lastOccurredAt)`, `error_patterns(fingerprint, lastSeenAt)`.

### 3. Async job queue (`IngestJob` / `src/lib/ingest-queue.ts`)

Kinds: `agent_loop` · `notify_fanout` · `knowledge_embed` · `echo_learn_from_runbook` · `echo_learn_from_pattern`

- Dedupe key prevents double-queue (`agent:{ticketId}`).
- Drained by `POST /api/ops/poll-failures` and `POST /api/ops/drain-queue` (`CRON_SECRET`).
- Sequential within batch — protects Neon pool + LLM spend.

### 4. Notify fan-out

- ≤25 targets: sync (canary / small ACCOUNT).
- \>25 GLOBAL/COHORT: enqueue `notify_fanout` chunks of 40.

### 5. Hot-path HTTP semantics

| Path | Success | Throttle |
|---|---|---|
| `/api/relay/error-events` | `201` create / `202` dedupe | `429` |
| `/api/help-desk/self-report` | `201` / `202` | `429` |
| `/api/knowledge/ingest` | `202` | `429` |
| `/api/webhooks/github` | `202` always (after verify) | `429` |

All throttle bodies include `code: RATE_LIMITED` and a **shape+label** string (colorblind-safe).

---

## Cron / Render

```yaml
# render.yaml — every 5 minutes
echoaurion-company-os-ops-poll
  → node scripts/cron-ops-poll.mjs
  → POST /api/ops/poll-failures
```

Also drains up to 10 ingest jobs per run. Under heavy backlog, hit `/api/ops/drain-queue` more often (or add a 1-minute cron later).

---

## Next (not blocking)

1. **Redis / Upstash** rate counters shared across Render instances.
2. **Dedicated worker** (Render background / queue service) for LLM jobs only.
3. **Neon connection limits** — keep pool small; never open a connection per client in a fan-out loop (already batched via outbox).
4. **pgvector embeddings** for Echo learning — job kind `knowledge_embed` is a no-op until enabled (`docs/ECHO_LEARNING_PLANE.md`).

---

## Operator checklist

- [ ] Deploy migration `20260712210000_scale_and_echo_learning`
- [ ] Confirm cron `ops-poll` has `CRON_SECRET` + `WEB_SERVICE_URL`
- [ ] Optional: raise `RATE_ERROR_GLOBAL` if false-positive 429s during drills
- [ ] Watch Help Desk for `○ Deduped · ×N` and Knowledge Plane queue pending badge
