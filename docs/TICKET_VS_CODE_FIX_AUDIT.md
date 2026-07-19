# Ticket vs code-fix audit

**Date:** 2026-07-19  
**Audience:** William Morrison  
**Repos:** Company OS (`claude/vigilant-rubin-DtQE3`) + Pilot (`Echo_Aurion-LUCCCA_Framework`)

---

## Verdict (plain English)

**Approve & send does not change the product.** It posts an admin reply, pushes relay events (`answer_ready`, and for Echo AI tickets `echo_repair_ready`), and marks the ticket `RESOLVED`. It never merges a PR, never runs Architect into production, and never triggers a Render deploy.

That is why the same crashes keep coming back: operators (and Echo auto-approve) can clear the queue while the bug is still on the branch that `luccca-web` actually serves.

---

## What Render is deploying today

| Service | Branch in `render.yaml` | Live health probe (2026-07-19) |
|---|---|---|
| **luccca-web** | `claude/laughing-noether-lSZwe` | `commit: 3f51a8f02`, `branch: claude/laughing-noether-lSZwe` |
| luccca-workers | `claude/laughing-noether-lSZwe` | (tracks web) |
| luccca-py-api | `claude/laughing-noether-lSZwe` | **HTTP 502** (down) |

**Action for William:** Render must keep deploying **`claude/laughing-noether-lSZwe`** (what is live today), **or** deliberately flip `render.yaml` + the Render dashboard to another branch after merging. Do **not** assume `-deploy` is what guests hit.

Local tip branch `claude/prospect-to-plate-framework-deploy` is **ahead of laughing-noether by ~34 commits** and **behind by ~110**. Several crash soft-fails live only on `-deploy`.

---

## Approve & send — exact gap

| Step | What happens |
|---|---|
| Knights draft | Text in thread; may say `NEEDS_CODE_CHANGE` |
| **Approve & send** (`POST …/approve` mode `reply`) | ADMIN message + `answer_ready` + optional soft directive |
| Echo AI tickets | Also `echo_repair_ready` (“repair made — try again”) — **silent**, no toast that proves a code ship |
| Ticket status | → `RESOLVED` (+ `closeReason` stamped; see below) |
| Architect PR plan | Draft PR / plan JSON only — **explicitly never merge** (`/api/work/[id]/pr-plan`) |
| Standby / `ECHO_AUTO_APPROVE` | Can auto-send reply + `echo_repair_ready` while **BUILD / merge stay locked** |

**Honest mapping:**

| Operator feeling | Reality |
|---|---|
| “Approved = fixed” | **False** — reply-only unless a commit is on the **deployed** branch |
| “Echo said repair ready” | Echo was told to retry; product may still throw |
| “WorkRequest / PR plan = shipped” | Draft only until human merges **and** Render redeploys that SHA |

---

## Recurring fingerprints vs branch reality

Checked against live SHA `3f51a8f02` (laughing-noether) vs tip `-deploy`:

| Issue | On live `laughing-noether`? | On `-deploy` tip? | Notes |
|---|---|---|---|
| **`ytd.gross` crash** (`data.ytd.gross` without guard) | **Still vulnerable** in `MyEcho.tsx` PayView | Soft-fail (`ytd ?? {}`, `Number(…??0)`) | Classic approve-without-deploy recurrence |
| **Nutrition analyze wiring** | Older path; `2683605a7` **not** ancestor of live | `fix(culinary): wire nutrition analyze…` present | 404/empty UX can persist on live |
| **Language / i18n selector** | Shared history includes picker/auth fixes | Same family of fixes | If still recurring, verify **locale deploy + cache**, not Approve |
| **Chronos 403 (Z1 replay)** | `40a5dc3b8` is on laughing-noether | Also on `-deploy` | If still red, likely **role/JWT / py-api**, not missing commit |
| **py-api dependent panels** | Soft-fail commit `66ff14540` **not** on laughing-noether | On `-deploy` | Live **luccca-py-api = 502** → mobile/finance shims fail regardless of Approve |

---

## DB volume (HelpTicket / WorkRequest)

**Company OS `DATABASE_URL` was not available in this workspace** (no `.env.local`; product Neon has no `help_tickets` table). Counts could not be queried from here.

Run on **Company OS Neon** (Render → `echoaurion-company-os` → `DATABASE_URL`):

```sql
-- Status mix
SELECT status, COUNT(*) FROM help_tickets GROUP BY 1 ORDER BY 2 DESC;

-- Echo AI / ECHO intake
SELECT
  COUNT(*) FILTER (WHERE "intakeChannel" = 'ECHO' OR "moduleHint" = 'echo_ai') AS echo_ai,
  COUNT(*) FILTER (WHERE status = 'AWAITING_APPROVAL') AS awaiting_approval,
  COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved,
  COUNT(*) FILTER (WHERE "closeReason" = 'reply_sent_code_pending') AS reply_code_pending,
  COUNT(*) FILTER (WHERE "closeReason" = 'resolved_fix') AS marked_code_fix
FROM help_tickets;

-- Recurring fingerprints (open + resolved)
SELECT fingerprint, COUNT(*) AS tickets, SUM("occurrenceCount") AS occurrences,
       MAX(status) AS any_status, MAX("lastOccurredAt") AS last_seen
FROM help_tickets
WHERE fingerprint IS NOT NULL
GROUP BY 1
HAVING COUNT(*) > 1 OR SUM("occurrenceCount") > 2
ORDER BY occurrences DESC
LIMIT 40;

-- CustomerQuestion / WorkRequest
SELECT status, COUNT(*) FROM customer_questions GROUP BY 1;
SELECT status, COUNT(*) FROM work_requests GROUP BY 1;

-- Architect plans that never shipped (draft only)
SELECT COUNT(*) FILTER (WHERE "draftPlan" IS NOT NULL) AS with_plan,
       COUNT(*) FILTER (WHERE status IN ('DONE','SHIPPED','COMPLETED')) AS done_like
FROM work_requests;
```

Paste results into this doc’s appendix when available.

**Expected shape (from code paths, not DB):** a large share of `RESOLVED` will be **reply-only** or Echo silent-radio acks; only tickets with `closeReason = resolved_fix` **and** SHA on laughing-noether should count as product-fixed.

---

## Why the same issue recurs (ranked)

1. **Approve ≠ merge/deploy** — RESOLVED after chat while bug remains on live SHA.  
2. **Deploy branch mismatch** — crash soft-fails landed on `-deploy`; Render serves **laughing-noether**.  
3. **`echo_repair_ready` false confidence** — Echo retries; UI still crashes → new fingerprint / occurrence.  
4. **luccca-py-api 502** — Python sidecar down; Node soft-fail for that path is on `-deploy`, not live.  
5. **Architect draft PRs never auto-merge** — by design.

---

## Concrete fix plan

### Immediate (ops — William)

1. **Treat live branch as source of truth:** `claude/laughing-noether-lSZwe` @ current Render commit.  
2. **Cherry-pick or merge** into laughing-noether (then let autoDeploy run):
   - Soft-fail `ytd.gross` / KPI / room hardeners from `-deploy`
   - Nutrition analyze wiring (`2683605a7`) if still broken on live
   - Help Desk py-api soft-fail (`66ff14540`) while py-api is unhealthy  
3. **Repair luccca-py-api** (502): Atlas `MONGO_URL` required per `render.yaml` / `7fe7fe47c` notes.  
4. **Stop counting Approve as a code fix** — use Help Desk badges (below).

### Product / Company OS (done in this change)

- Approve stamps `closeReason`:
  - `reply_sent_code_pending` when Knights/core signal code still needed  
  - `resolved_fix` only when answer looks like a shipped fix (ideally with SHA)  
  - else `resolved_howto`  
- UI badges: **▲ Chat replied · Code not deployed** vs **✓ Fixed in \<SHA\>**  
- SYSTEM timeline note on every Approve explaining disposition  

### Next (small, not boiled ocean)

| Priority | Change |
|---|---|
| P1 | Only allow `closeReason=resolved_fix` when operator pastes SHA **and** (optional) CI checks SHA ⊆ deploy branch tip |
| P1 | Cron/ops card: “RESOLVED but fingerprint re-hit in 24h” = reopen or bump occurrence |
| P2 | Wire `productFixDeployed` / `fixedInSha` columns when deploy webhook fires |
| P2 | Flip Render branch only after merging `-deploy` tips into laughing-noether (or cut over once) |

---

## Operator cheat sheet

| Badge | Meaning | Your next move |
|---|---|---|
| ▲ Chat replied · Code not deployed | Reply / Echo ack only | Merge fix onto **laughing-noether**, wait for Render, then mark `resolved_fix` + SHA |
| ✓ Fixed in \<SHA\> | Claimed product fix | Confirm SHA ≤ live `/api/health` commit (or redeploy) |
| ◆ Echo AI + RESOLVED | Silent radio may have auto-acked | Check disposition badge; don’t assume guest is unblocked |

---

## Appendix A — Key code pointers

- Approve: `src/app/api/help-desk/tickets/[id]/approve/route.ts`  
- Live delivery: `src/lib/live-repair-delivery.ts` (no merge)  
- Architect: `src/app/api/work/[id]/pr-plan/route.ts` (“never merge”)  
- Disposition helper: `src/lib/fix-disposition.ts`  
- Pilot Render: `Echo_Aurion-LUCCCA_Framework/render.yaml` → `branch: claude/laughing-noether-lSZwe`

---

*Aurion Holdings, Inc. · EchoAurion Company OS*
