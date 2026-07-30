# CRON_SECRET setup (Render)

## Flash — all cron runs Failed

If **every** Company OS cron shows **Failed run** (maintenance, sync, briefing, help-eval-friday, cost-anomaly) while the **web** service is Deployed:

1. `CRON_SECRET` on the **web** service alone is **not enough**.
2. Paste the **same** `CRON_SECRET` on **each cron service** Environment tab.
3. Blueprint `sync: false` means Render will **not** copy the value from web → cron.
4. Look for `ops-poll` (`echoaurion-company-os-ops-poll`) — if it is **missing** from the Super_Admin list, search other folders or create it from Blueprint. Without ops-poll, failure ingest + agent_loop drain stay asleep.

With `RENDER_API_KEY` on Company OS web, an admin can rotate `CRON_SECRET` across **every** holder in one call via `POST /api/dr-os/render-config` (see **Atomic rotation** below). Until that key exists, William must paste in the dashboard. Knights never receive `RENDER_API_KEY`. See `docs/OPEN_OPS_CHECKLIST.md` §6.

---

## Atomic rotation (why the key kept half-changing)

`CRON_SECRET` is a shared value: crons send it, web verifies it. Writing it to **one** service is always an outage — every holder still on the old string 401s. That is exactly the recurring incident where web + 7 crons had the new secret while desk-moles, help-eval-friday, briefing and `luccca-py-api` still had the old one.

The API now makes single-service writes impossible:

- `CRON_SECRET` is **removed from the generic env allowlist**. Any attempt to set it with `{"service": "...", "env": {"CRON_SECRET": "..."}}` alone is rejected with `FANOUT_REQUIRED`.
- Rotation **discovers holders live** from the Render API — every service named `echoaurion-company-os` or `echoaurion-company-os-*`. A cron added tomorrow is included without a code change; nothing is hardcoded.
- Holders outside that prefix (e.g. `luccca-py-api`) are listed in `CRON_SECRET_EXTRA_HOLDERS` on the web service, comma-separated. If a name there matches no Render service, the rotation refuses to start rather than leaving it stale.
- Writes happen in **two phases**. All cron holders first; if **any** of them fails, the rotation **aborts before web is touched** — the old secret still matches everywhere and nothing 401s. Web (the verifier) is written last.
- The response always names exactly which services were updated and which failed. Any failure returns HTTP 500 and raises a **CRITICAL** alert to William's phone. There is no silent partial success.

### Rotate (admin session)

```bash
curl -sS -X POST -b "$SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"env":{"CRON_SECRET":"<openssl rand -hex 32 output>"},"confirmRotateCronSecret":true}' \
  https://<company-os-host>/api/dr-os/render-config
```

`confirmRotateCronSecret: true` is mandatory — it prevents a rotation happening as a side effect of setting some other key. The `service` field is ignored for `CRON_SECRET`: rotation is always fleet-wide.

A successful response lists every holder:

```json
{ "success": true, "data": { "label": "✓ CRON_SECRET rotated on all 11 holder(s)",
  "rotation": { "phase": "complete", "updated": ["echoaurion-company-os", "..."], "failed": [] } } }
```

### Automated rotation is gated

Constitution rule `no_core_self_harm` puts secret rotation under dual human control. `computer_agent` reaches this route with the same Bearer every cron carries, so **agent-initiated rotation is denied by default** (`ROTATION_NEEDS_HUMAN`). To permit a one-off automated rotation a human must both:

1. set `CRON_SECRET_ROTATION_ALLOW_AGENT=true` on the web service, and
2. pass `"approvedBy": "william_morrison"` in the request body.

Every rotation and every denial is logged with a `[cron-secret]` prefix in the web logs and written to `audit_log` as `dr_os.render_config.cron_secret_rotate`, `…_rotate_partial`, or `…_cron_secret_rotation_denied`. If the key changes unexpectedly, that audit action names the actor and approver.

### If a rotation fails

| Phase | Meaning | Action |
|---|---|---|
| `aborted_before_web` | One or more crons failed; **web untouched, old secret still works everywhere** | Fix the listed service (suspended? deleted? API permissions?) and re-run the same rotation |
| `web_failed` | Crons hold the new value, web does not — **crons will 401** | Re-run the rotation, or paste the new value on `echoaurion-company-os` web immediately |

---

Crons fail with `[cron] Missing CRON_SECRET` when the secret is **unset** on that cron service. The **same** value must exist on the web service and every cron.

## How to read the failure log

Cron scripts log presence only, never the value:

```text
Missing CRON_SECRET (CRON_SECRET:false)
```

- `CRON_SECRET:false` means **the env var is missing / empty** on that cron job.
- It does **not** mean the secret string is the word `"false"`.
- Blueprint `sync: false` on `CRON_SECRET` means Render **will not auto-copy** the value — you must paste it in the dashboard (or set via API).

## 1. Generate (local — do not commit)

```bash
openssl rand -hex 32
```

Copy the output. Never paste it into git, PRs, or chat logs.

## 2. Paste on web service (exact name)

1. Render Dashboard → **echoaurion-company-os** (web, Oregon)
2. **Environment** → find or **Add** `CRON_SECRET`
3. Paste the generated value → **Save Changes**

Web must have it too: crons POST `Authorization: Bearer $CRON_SECRET` to the web API.

## 3. Paste SAME value on EVERY cron (exact names)

Repeat for each cron: open the service → **Environment** → `CRON_SECRET` → paste **identical** value → **Save**.

| Service name (exact) | Type | Purpose |
|---|---|---|
| `echoaurion-company-os` | web | Receives cron Bearer auth |
| `echoaurion-company-os-maintenance` | cron | Hourly maintenance dispatch |
| `echoaurion-company-os-ops-poll` | cron | Every 5 min: failures → tickets + ingest drain |
| `echoaurion-company-os-sync` | cron | Daily financial sync |
| `echoaurion-company-os-briefing` | cron | Daily board briefing |
| `echoaurion-company-os-help-eval-friday` | cron | Thu HelpEval simulation |
| `echoaurion-company-os-cost-anomaly` | cron | Daily cost anomaly alerts |
| `echoaurion-company-os-fix-digest` | cron | Every 4h fix digest email |
| `echoaurion-company-os-echo-oncall` | cron | Unresolved Echo TECH escalation |
| `echoaurion-company-os-desk-moles` | cron | Desk mole sweep |
| `echoaurion-company-os-knight-drain` | cron | Knight queue drain |
| `echoaurion-company-os-db-backup` | cron | Nightly backup (talks to Render API directly, but kept on the same value so the fleet never drifts) |

This table is a convenience for dashboard pasting only. The **authoritative** holder set is whatever the Render API returns for the `echoaurion-company-os` prefix plus `CRON_SECRET_EXTRA_HOLDERS` — that is what the rotation API writes to, so a cron missing from this table is still covered.

Blueprint already declares `CRON_SECRET` with `sync: false` on web + all crons. You still must type the value in the dashboard.

`WEB_SERVICE_URL` is wired via Blueprint `fromService` → web `RENDER_EXTERNAL_URL`. Confirm it is set on each cron if Blueprint sync lagged.

### ops-poll missing from Super_Admin?

If the list shows web + maintenance/sync/briefing (+ optional help-eval / cost-anomaly) but **no ops-poll**:

1. Search all Render environments for `echoaurion-company-os-ops-poll`.
2. Prefer it next to the other Company OS crons in **Super_Admin**, same Oregon region.
3. If absent: create from Blueprint / add manually (`*/5 * * * *` → `node scripts/cron-ops-poll.mjs`) with the same `CRON_SECRET` + `WEB_SERVICE_URL`.

See `docs/RENDER_ENVIRONMENTS.md`.

## 4. Verify (5 minutes)

After saving env vars on all cron services:

1. Open **echoaurion-company-os-maintenance** → **Trigger Run** (or wait for hourly).
2. Open **echoaurion-company-os-ops-poll** → **Trigger Run** (create first if missing).
3. Logs should show `[cron] OK` (or a real HTTP status from the API) — **not** `Missing CRON_SECRET (CRON_SECRET:false)`.
4. If you get **401**, web and cron secrets do not match — re-paste the **same** value on both sides.
5. Web redeploy is only needed if you changed web env and an old instance is still running without it.

## Checklist (William)

- [ ] Ran `openssl rand -hex 32` and copied the value
- [ ] Set `CRON_SECRET` on **echoaurion-company-os** (web)
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-maintenance**
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-ops-poll** (create if missing)
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-sync**
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-briefing**
- [ ] Set the **same** `CRON_SECRET` on **help-eval-friday** + **cost-anomaly** + **fix-digest** if those crons exist
- [ ] Triggered maintenance + ops-poll — logs show success, not `CRON_SECRET:false`
