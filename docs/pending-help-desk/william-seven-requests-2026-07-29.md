# William — 7 Help Desk requests (2026-07-29 audit)

**Investigator:** Company OS + pilot code audit (no live Neon access in workspace)  
**Live branches:** COS `claude/vigilant-rubin-DtQE3` · pilot `claude/laughing-noether-lSZwe`

---

## Executive summary

**None of the 7 requests failed because auto-approve is off.** Through **2026-08-31**, `HELP_DESK_AUTO_APPROVE` + `HELP_DESK_AUTO_SEND_TECH` + DB permit bootstrap are wired. The dominant failure mode is **Class B: chat + `echo_repair_ready` shipped, product code not on `luccca-web` deploy branch**.

Approve / auto-approve = **customer reply + echo_repair_ready** — **not** merge or Render deploy.

---

## Why they feel “not done”

| # | Likely request theme | Ticket outcome | Why UI still broken | William action |
|---|---|---|---|---|
| 1 | **Chronos UI** — Menu & Wine + AI Recommendations | RESOLVED · `reply_sent_code_pending` | Skin fix in pilot (`905c0e24f`+) — confirm Render deployed SHA | Hard-refresh; verify `/api/health` ≥ Chronos commit; badge should read **▲ Chat replied · Code not deployed** until live |
| 2 | **Chronos panels / instrument look** (same thread) | Same | Same — reply ≠ remodel | Cherry-pick / merge UI commits onto **laughing-noether** only; never wholesale `-deploy` merge |
| 3 | **`ytd.gross` / dashboard soft-fail** | RESOLVED chat or Echo ack | Fix was on `-deploy` first; laughing-noether had port commits | Confirm live SHA includes soft-fail port (`75efba0fb` family) |
| 4 | **Recipe / nutrition / drop zone** | RESOLVED · code pending | Code ports exist on laughing-noether — deploy lag | Confirm SHA; retest after deploy |
| 5 | **Help Desk paste / screenshots** | May be RESOLVED with sanitized reply | Ingest fixed (`775fc62`, `2e16217` COS + pilot relay) | Re-send via **Send to client now** if old thread still shows draft prefix |
| 6 | **py-api / panel 502** (Atlas) | SYSTEM or TECH · chat soft-fail | **Ops:** `MONGO_URL` on Render **luccca-py-api** still required | Paste Atlas secret; code alias fix `7afc02e87` does not replace dashboard secret |
| 7 | **Language / i18n / role 403** | RESOLVED how-to or code pending | Mix of deploy cache, JWT role, py-api dependency | Check disposition badge; code fix vs config/how-to |

**Bulk approve:** `POST /api/ops/approve-all-awaiting` only clears **AWAITING_APPROVAL**. Most of William’s 7 are already **RESOLVED** with bad disposition or unreleased code — use **Send to client now** for clean copy, then ship code to laughing-noether.

---

## DB check (William — paste results when run)

On Company OS Neon:

```sql
SELECT id, status, "closeReason", "intakeGate", subject, "resolvedAt"
FROM help_tickets
WHERE "clientKey" LIKE '%luccca%' OR subject ILIKE '%chronos%' OR subject ILIKE '%menu%'
ORDER BY "createdAt" DESC
LIMIT 20;
```

Expect many `closeReason = reply_sent_code_pending` after Jul 2026 auto-approve fixes.

---

## Mole / ahead-of-time gaps (honest)

| Guardrail | Status | Gap |
|---|---|---|
| **Desk moles** (workflow / UX / i18n) | Cron wired daily 11:00 UTC → `desk-moles-run` | Report-only; does not fix product |
| **Night Cleaner** (panel floor walk) | Ingest API exists | **No pilot scheduled runner** → Dr. OS chip stays stale |
| **EKG Panel Sweep** | Works when EKG open | Not pre-open scheduled |
| **Echo panel watch** | `ECHO_PANEL_WATCH=on` default | Off = Echo auto-tickets refused; now visible on Dr. OS Connection panel |
| **Client error capture** | Best-effort POST | Swallows offline errors (DEV warns after this fix) |
| **CRON_SECRET** | Required for moles / ops crons | If unset, desk moles never run |

---

## UX fixes shipped (this change set)

- Pilot Help Desk thread: **ETA** (gate-based estimate), **full scrollable replies** (16k cap), **▲ Chat replied · Code not deployed** vs **✓ Issue fixed**
- Relay history / pull / `answer_ready` carry `closeReason`, disposition, ETA
- Operator badges: **✓ Issue fixed · SHA** (William console)

---

## William next steps (ordered)

1. Deploy COS **vigilant-rubin** tip + pilot **laughing-noether** tip after this push.
2. Render env: `HELP_DESK_AUTO_APPROVE=true`, `HELP_DESK_AUTO_SEND_TECH=true`, `HELP_DESK_AUTO_SEND_UNTIL=2026-08-31T23:59:59.999Z`, `ECHO_PANEL_WATCH=on`, `CRON_SECRET` set.
3. Open Help Desk chrome → confirm thread badges + scroll on longest reply.
4. For each RESOLVED Chronos ticket: if **▲ Chat replied**, merge UI fix to laughing-noether → wait for deploy → **Send to client** with “Fixed in \<SHA\>” → mark `resolved_fix`.
5. Paste `MONGO_URL` on **luccca-py-api** if panels still 502.
6. Run SQL above; append ticket IDs to this doc for tracking.

---

*Aurion Holdings, Inc. · EchoAurion Company OS*
