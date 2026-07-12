# Error Capture & Scope (ZARO → Help Desk)

**Branches:** Company OS `claude/vigilant-rubin-DtQE3` · Product `claude/laughing-noether-lSZwe`  
**Purpose:** Users never see stack traces. Runtime errors auto-open Help Desk SYSTEM tickets, classify blast radius + taxonomy, notify when fixed, and gate remediation (draft PR / dual control — never silent production merge).

---

## ZARO provenance (what already existed)

| Piece | Location | Role reused |
|---|---|---|
| StructuredError schema | Product `server/lib/observability/error-schema.ts` | Foundation for self-healing tech support — `error_id`, `error_class`, module/org context |
| Error catalog | Product `server/lib/observability/error-catalog.ts` | Class patterns + runbooks |
| Express error capture | Product `server/middleware/error-capture.ts` | Sanitized client envelopes (no internal leak) |
| Diag / Universal boundaries | Product `client/lib/diagnostics/*`, `UniversalErrorBoundary`, `ErrorBoundary` | Catch + Sentry/diag emit (UI still showed stacks — replaced) |
| ZARO Guardian / snapshots | Product `client/modules/Zaro`, `server/zaro-lib.ts` | Repo integrity / restore — **not** runtime ticket capture; name lives on for lineage |
| Fleet blast-radius UI | Company OS Fleet Nexus | Operational blast maps (infra) — parallel concept to error scope |
| Maintenance fan-out | Company OS `MaintenanceNotice` + `resolveTargetClientKeys(ALL)` | Reused for GLOBAL notify-when-fixed |
| Safe tools / PR-only | Company OS `safe-tools`, `pr-from-build`, constitution | Gated remediation |

William’s “this was originally part of ZARO” maps to the **observability StructuredError + error-capture middleware** intent (automated classification / support correlation). Help Desk tickets + scope + notify live in Company OS.

---

## Flow

```
Pilot ErrorBoundary / window.onerror / unhandledrejection
  → POST /api/company-os-relay/error-events (secret server-side)
  → Company OS POST /api/relay/error-events
  → classify scope + ErrorCategory + productLine
  → HelpTicket SYSTEM (fingerprint dedupe ≤1h)
  → upsert ErrorPattern (fleet learning, no PII)
  → on RESOLVED: notify per scope (show_message / feature_available → ALL)
```

### Scope

| Scope | Meaning | Notify when fixed |
|---|---|---|
| `USER` | One session/device | That `clientKey` (+ optional `sessionHint` in payload) |
| `ACCOUNT` | One org / property / install cluster | Property siblings + affected keys |
| `GLOBAL` | Platform-wide (LanguageProvider, shared chunk, 2+ clientKeys) | **All** SupportClients + `feature_available` / refresh directive |

Operators can **Promote to GLOBAL** from Help Desk. Scope never demotes from GLOBAL.

### Taxonomy (`ErrorCategory`)

`UI` · `API` · `AUTH` · `DATA` · `INTEGRATION` · `INFRA` · `UNKNOWN`

Plus `productLine`: `echoaurion` | `company-os` | `aurion-index` | …

Stored on ticket **and** aggregated in `error_patterns` for Knowledge Plane / `GET /api/help-desk/error-patterns` (hit counts, distinct clients — **no PII**).

---

## Core protection (anti-hallucination / self-harm)

Constitution rule `no_core_self_harm` + `src/lib/core-path-guard.ts`:

**Deny-list (forces `NEEDS_HUMAN_CORE_REVIEW`, blocks standby auto-approve):**
- `src/lib/auth`, `middleware`, `src/lib/relay-auth`, constitution
- Secrets / `.env` / ingest secrets
- Destructive migrate (`DROP`, `migrate reset`, force-reset)
- Force-push

**GLOBAL code fixes:** draft PR only — never agent merge (`merge_pr` constitutionally denied).

**Safe tools OK:** `restart_worker`, `clear_cache`, `show_message` under autonomy dial (dry-run default).

Knights drafts and Architect PR plans are scanned; core hits set ticket `needsHumanCoreReview` + status `AWAITING_APPROVAL` and append a SYSTEM flag message.

---

## User UX

Friendly recovery only: **“We’re on it”** — no stack traces, no LanguageProvider raw errors in the recovery UI. Culinary `useTranslation` soft-fails with fallback dictionary when provider is missing (fixes Commissary re-export / partial mounts).

---

## How to test

1. Company OS: `npx prisma migrate deploy` (migration `20260712180000_error_capture_scope`).
2. Set matching `SUPPORT_INGEST_SECRET` / `COMPANY_OS_INGEST_SECRET`.
3. Pilot: trigger a render error or `window.dispatchEvent` path; confirm SYSTEM ticket with scope/category badges.
4. Repeat same fingerprint within 1h → `occurrenceCount` increments (no new ticket spam).
5. Resolve ticket → outbox `show_message` (and `feature_available` if GLOBAL).
6. Knights draft mentioning `src/lib/auth` → `NEEDS_HUMAN_CORE_REVIEW`, standby blocked.
7. Analytics: `GET /api/help-desk/error-patterns`.
