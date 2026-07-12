# Knights Continuous Improvement Flywheel

**Branches:** Company OS `claude/vigilant-rubin-DtQE3` · Pilot `claude/laughing-noether-lSZwe`  
**Purpose:** As Knights fix systems, improve the Knights — and Company OS dogfoods the same loop.

---

## Flywheel (prose diagram)

```
Customer / Company OS crash
        │
        ▼
  Redact payloads (email/JWT/token/qs)
        │
        ▼
  Classify scope: USER → ACCOUNT → COHORT → GLOBAL
        │
        ▼
  HelpTicket SYSTEM + ErrorPattern (fleet learning)
        │
        ├─► Timeline: Issue detected
        │
        ▼  (GLOBAL / HIGH / URGENT)
  computer_agent queues:
        ├─ WorkRequest FIX
        ├─ Architect draft PR plan (merge forbidden)
        └─ Knights dispatch (partial seats OK)
                │
                ├─► Load PROMOTED/DRAFT runbooks for fingerprint
                ├─► Skip UNAVAILABLE seats (billing/outage) — continue
                └─► Core-path guard → NEEDS_HUMAN_CORE_REVIEW
        │
        ▼
  Timeline: Fixing · UI: “Agent + Knights working”
        │
        ▼
  William + Cursor continue the PR while Knights counsel
  (same constitution / core deny-list)
        │
        ▼
  RESOLVED (approve or mark resolved)
        │
        ├─ Timeline: Fixed (detected → fixing → fixed)
        ├─ Notify by scope (+ canary → fleet for GLOBAL)
        ├─ KnightEval: draft vs final fix score → /lab/elite data
        └─ KnightRunbook upsert
                │
                ├─ Core harm text → REJECTED (never “remove auth middleware”)
                └─ Promote if confirmedBy=william_morrison OR eval ≥ 0.72
                        │
                        └─► Next similar fingerprint gets runbook context
```

---

## Scope notify rules

| Scope | Who gets “fixed” |
|---|---|
| USER | Originating `clientKey` (+ sessionHint) |
| ACCOUNT | Property siblings + affected keys |
| COHORT | Matching browser/OS/appVersion snapshots when possible |
| GLOBAL | Optional `canaryClientKeys` first → then ALL (`rolloutStage`) |

User-facing copy follows **Issue detected → fixing → fixed** (friendly recovery only — no stacks).

---

## Protection

- `src/lib/core-path-guard.ts` deny-list (auth, middleware, secrets, destructive migrate, “remove auth middleware”, …).
- Learning **never** auto-writes runbooks that prescribe core self-harm.
- Runbook `PROMOTED` requires `confirmedBy: william_morrison` **or** KnightEval pass.
- Architect / agent: **draft PR only** — `merge_pr` constitutionally denied.
- All auto steps audit as `computer_agent`.

---

## Partial Knights / provider health

If Scout (or any seat) is UNAVAILABLE (billing, timeout, missing key), Help Desk **continues with remaining seats**. SYSTEM message lists skipped seats. Never fail the whole convene because one provider is down.

---

## Dogfood (Company OS)

- `src/app/error.tsx` + `global-error.tsx` → `POST /api/help-desk/self-report`
- `productLine: company-os`, `clientKey: company-os-internal`
- Same ingest → ticket → agent/Knights path

---

## Operator UI

Help Desk SYSTEM tickets show:

- Scope / category / **Agent + Knights working**
- Cohort metadata, canary list, rollout stage
- **Canary then fleet** + **Promote canary → fleet**
- Promote to COHORT / GLOBAL

---

## How William + Cursor continue a PR

1. Ticket shows linked `workRequestId` + Architect plan in work context.
2. Open draft branch / PR from plan (or create in Cursor from the plan body).
3. Knights drafts stay on the ticket for counsel — do not treat as merge authority.
4. Dual-control + core review if `NEEDS_HUMAN_CORE_REVIEW`.
5. Resolve ticket → pilots notified; runbook/eval feed the next incident.

See also: `docs/ERROR_CAPTURE_AND_SCOPE.md`, `docs/PR_FROM_BUILD.md`, `docs/CONSTITUTION.md`.
