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

| Service | Branch in `render.yaml` | Live health probe / tip |
|---|---|---|
| **luccca-web** | `claude/laughing-noether-lSZwe` | Tip pushed **2026-07-19:** `e98b29a52` (await Render autoDeploy; prior probe was `3f51a8f02`) |
| luccca-workers | `claude/laughing-noether-lSZwe` | (tracks web) |
| luccca-py-api | `claude/laughing-noether-lSZwe` | **HTTP 502** until Atlas `MONGO_URL` is set in Render dashboard (code fix `7afc02e87` cherry-picked; see below) |

**Action for William:** Render must keep deploying **`claude/laughing-noether-lSZwe`** (what is live today), **or** deliberately flip `render.yaml` + the Render dashboard to another branch after merging. Do **not** assume `-deploy` is what guests hit.

### Cherry-picks onto laughing-noether (2026-07-19) — Approve ≠ needed for these

Careful port from `-deploy` (no wholesale merge). New tip: `7afc02e87` (includes MONGO_URL ops fix).

| New SHA on laughing-noether | Upstream source | What it ships |
|---|---|---|
| `75efba0fb` | `31811960e` | Soft-fail `ytd.gross` / paystubs / forecast / room crashes + Help Desk drop/paste |
| `591919189` | `2683605a7` | `POST /api/nutrition/analyze` + Recipe Library drop/select (kept Excel/CSV lane) |
| `87f938529` | `66ff14540` | Help Desk per-user threads + soft-fail when luccca-py-api 502 |
| `e98b29a52` | `1714ddbff` | MyEcho Help Desk chrome + Company OS relay |
| `7afc02e87` | `7fe7fe47c` | Atlas `MONGO_URL` / fuse-box aliases + `render.yaml` for luccca-py-api |

**Already on laughing before this port:** `f33da8540` (Recipe Library Excel/CSV drag-drop).

**Still required (ops — William):** Set Atlas **`MONGO_URL`** (`mongodb+srv://…`) on Render service **luccca-py-api**. Cherry-pick `7afc02e87` aligns fuse-box + `render.yaml` aliases (`MONGO_URL` / `MONGODB_URL` / `MONGODB_URI`) and rejects localhost; without the Atlas secret in the dashboard, py-api stays 502.

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

Checked against laughing-noether tip `7afc02e87` (pushed; confirm via `/api/health` after Render) vs tip `-deploy`:

| Issue | On live `laughing-noether`? | On `-deploy` tip? | Notes |
|---|---|---|---|
| **`ytd.gross` crash** (`data.ytd.gross` without guard) | **Ported** (`75efba0fb` ← `31811960e`) | Soft-fail present | Wait for Render; then re-check fingerprint |
| **Nutrition analyze wiring** | **Ported** (`591919189` ← `2683605a7`) | Present | `POST /api/nutrition/analyze` mounted |
| **Recipe Library drop/select** | **Ported** (+ Excel/CSV already via `f33da8540`) | Present | Visible drop zone + file picker |
| **Help Desk drop/paste + MyEcho** | **Ported** (`75efba0fb`, `e98b29a52`) | Present | |
| **Language / i18n selector** | Shared history includes picker/auth fixes | Same family of fixes | If still recurring, verify **locale deploy + cache**, not Approve |
| **Chronos 403 (Z1 replay)** | `40a5dc3b8` is on laughing-noether | Also on `-deploy` | If still red, likely **role/JWT / py-api**, not missing commit |
| **py-api dependent panels** | Soft-fail **ported** (`87f938529` ← `66ff14540`); MONGO_URL code **ported** (`7afc02e87` ← `7fe7fe47c`) | Present | **py-api itself still 502** until Atlas `MONGO_URL` is set in Render dashboard |

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
4. **luccca-py-api 502** — Python sidecar still down until Atlas `MONGO_URL`; Node Help Desk soft-fail is now on laughing-noether (`87f938529`).  
5. **Architect draft PRs never auto-merge** — by design.

---

## Concrete fix plan

### Immediate (ops — William)

1. **Treat live branch as source of truth:** `claude/laughing-noether-lSZwe` @ Render `/api/health` commit (expect `7afc02e87` after autoDeploy).  
2. **Product soft-fails + MONGO_URL code cherry-picked** (done 2026-07-19) — see table above; confirm deploy finished.  
3. **Repair luccca-py-api** (502) — still open on **ops**:
   - Set **Atlas** `MONGO_URL` (`mongodb+srv://…`) on Render service **luccca-py-api** (not localhost).
   - Code fix is on laughing-noether as `7afc02e87` (aliases + reject loopback); dashboard secret is still required.
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
