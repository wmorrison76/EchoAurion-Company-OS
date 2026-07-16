# Echo Learning Plane

**Branch:** `claude/vigilant-rubin-DtQE3`  
**Purpose:** System-wide, PII-safe learning that Company OS / Dr. OS own — procedures, SOPs, error patterns, Knight runbooks — shareable across Echo instances without guest or staff personal data.

Extends (does not replace):

- Aurion Knowledge Plane signals (`KnowledgeSignal` / `docs/AURION_KNOWLEDGE_PLANE.md`)
- Knights flywheel (`KnightRunbook` / `KnightEval` / `docs/KNIGHTS_FLYWHEEL.md`)
- Help Files (`HelpArticle`)
- Redaction (`src/lib/error-redact.ts`, `FORBIDDEN_PII_KEYS` in `knowledge-ingest.ts`)

Pilot property RAG (`echo_knowledge_chunks` + pgvector on the product DB) stays **property-local**. The hub plane here is **network/fleet** learning.

---

## Architecture

```
Sources (runbooks, ErrorPatterns, HelpArticles, book text)
        │
        ▼
  Redact (email/JWT/PAT/env/phone) + PII key deny-list
        │
        ▼
  Classify section/domain + shareScope
        │
        ▼
  EchoKnowledgeChunk (text + JSON metadata; embedding NULL for now)
        │
        ├─► Retrieve API (keyword/ILIKE) → Echo instances
        ├─► Teach other Echos = GLOBAL / COHORT only
        └─► Queue knowledge_embed (no-op until Neon pgvector)
```

### Ownership

| Layer | Owner | Contents |
|---|---|---|
| Hub learning plane | Company OS / Dr. OS | Runbooks, anonymized patterns, ops help, hospitality domain (scrubbed) |
| Property RAG | Per-property Echo (Pilot) | Recipes, BEOs, menus — org-scoped, never relayed as guest PII |
| Knowledge Plane signals | Company OS | Aggregated telemetry envelopes (existing) |

---

## PII deny-list (non-negotiable)

**Never store:** guest names, emails, phones, room numbers, loyalty IDs, payment details, staff PII, free-text that may contain PII without redaction, raw CRM investor pitches / personal notes.

**Prefer:** procedures, SOPs, product behavior, error patterns, fix runbooks, hospitality domain concepts, anonymized aggregates.

Ingest rejects bodies with forbidden keys (`findForbiddenPiiKey`) and always runs `redactSensitive` on text.

---

## Schema

`EchoKnowledgeChunk` (`echo_knowledge_chunks`):

| Field | Notes |
|---|---|
| `section` | ops · hospitality · runbook · help · error_pattern · procedure · domain |
| `sourceType` / `sourceRef` | Provenance (e.g. `knight_runbook` + id) |
| `contentRedacted` | Only cleaned text |
| `embedding` | JSON null — **TODO** Neon `pgvector` |
| `productLine` | echoaurion · company-os · … |
| `clientKey` | null for GLOBAL/COHORT |
| `shareScope` | `GLOBAL` \| `COHORT` \| `ACCOUNT` |

**Teach other Echos:** retrieve API returns **GLOBAL + COHORT only**. ACCOUNT never crosses the fleet. Optional promote-to-fleet for learning mirrors canary: William confirms before a chunk’s `shareScope` widens (operator process; API promote hook can follow).

---

## APIs

| Route | Auth | Role |
|---|---|---|
| `POST /api/knowledge/retrieve` | `KNOWLEDGE_INGEST_SECRET` or `ECHO_AI_KEY` | Keyword retrieve for Echo |
| `POST /api/knowledge/book-ingest` | ingest secret | Pre-extracted book/PDF **text** → scrubbed chunks (no raw upload) |
| `GET /api/knowledge/learning-stats` | session | Counts + last ingest + `✓ PII scrub active` |
| `POST /api/knowledge/backfill` | session or `CRON_SECRET` | One-shot seed from runbooks / patterns / help |
| Existing `POST /api/knowledge/ingest` | ingest secret | Telemetry signals (rate-limited) |

### How learning fills (automatic)

| Source | When | Writes |
|---|---|---|
| **PROMOTED** KnightRunbook | After SYSTEM ticket resolve (William confirm or eval ≥ 0.72) or promote | `EchoKnowledgeChunk` + `knowledge_meta` signal |
| ErrorPattern **GLOBAL / COHORT** | On pattern upsert from error ingest | Queued → chunk + meta signal |
| HelpArticle **public / ops / macro** | On create/update (blocked tags skipped) | Queued → chunk + meta signal |
| IngestJob drain | After resolve + ops-poll cron (`processIngestJobs`) | Executes `echo_learn_*` jobs |

**Why the plane showed 0:** Edge Echo telemetry was never POSTed (product client not wired), learning jobs were queued but not always drained, patterns/help never enqueued, and chunk upserts did not emit `KnowledgeSignal` — so both Signals and Chunks KPIs stayed empty.

ACCOUNT / USER patterns never enter fleet retrieve. Redact + `FORBIDDEN_PII_KEYS` always apply.

### William — verify after deploy

1. Confirm migrate already applied: `20260712210000_scale_and_echo_learning` (tables `echo_knowledge_chunks`, `ingest_jobs`, `knowledge_signals`).
2. Open `/knowledge-plane` → click **Backfill learning** (or `POST /api/knowledge/backfill` with session cookie).
3. Expect non-zero **Learning chunks** and **Signals** if any PROMOTED runbooks, GLOBAL/COHORT patterns, or ops/public help exist; otherwise resolve a SYSTEM ticket or promote a runbook, then refresh.
4. Ops cron: `POST /api/ops/poll-failures` / `drain-queue` with `CRON_SECRET` continues draining the queue (set on Render — see `docs/CRON_SECRET_SETUP.md`).

Automatic hooks:

- Knight runbook upsert/promote → queue `echo_learn_from_runbook` (PROMOTED only) + drain
- Error pattern GLOBAL/COHORT → queue `echo_learn_from_pattern`
- Help public/ops/macro → queue `echo_learn_from_help`
- Resolve flywheel → `drainLearningQueue` so UI fills without waiting for cron

---

## Scale

Learning embed jobs go through `ingest_jobs` (see `docs/SCALE_AND_THROTTLE.md`). Never embed synchronously on the request path under burst.

---

## Next steps (embeddings)

1. Enable `CREATE EXTENSION vector` on Company OS Neon (separate from Pilot).
2. Switch `embedding` column to `vector(1536)` (raw SQL migration).
3. Implement `knowledge_embed` job using OpenAI `text-embedding-3-small` (reuse Pilot `echo-rag.ts` patterns).
4. Upgrade retrieve to cosine + keyword hybrid.

Until then: **keyword/ILIKE is production-usable** for runbook/help/pattern teaching.
