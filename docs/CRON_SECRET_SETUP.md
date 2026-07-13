# CRON_SECRET setup (Render)

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

Blueprint already declares `CRON_SECRET` with `sync: false` on web + all four crons. You still must type the value in the dashboard.

`WEB_SERVICE_URL` is wired via Blueprint `fromService` → web `RENDER_EXTERNAL_URL`. Confirm it is set on each cron if Blueprint sync lagged.

Optional later (same `CRON_SECRET` — now in Blueprint as dedicated crons):

| Service name (exact) | Schedule | Path |
|---|---|---|
| `echoaurion-company-os-help-eval-friday` | Thu 22:00 UTC | `POST /api/ops/help-eval-friday` |
| `echoaurion-company-os-cost-anomaly` | Daily 08:30 UTC | `POST /api/ops/cost-anomaly` |

Paste the **same** `CRON_SECRET` on these when Blueprint creates them (or add manually in Super_Admin). See `docs/RENDER_ENVIRONMENTS.md`.

## 4. Verify (5 minutes)

After saving env vars on all five services:

1. Open **echoaurion-company-os-maintenance** → **Trigger Run** (or wait for hourly).
2. Open **echoaurion-company-os-ops-poll** → **Trigger Run**.
3. Logs should show `[cron] OK` (or a real HTTP status from the API) — **not** `Missing CRON_SECRET (CRON_SECRET:false)`.
4. If you get **401**, web and cron secrets do not match — re-paste the **same** value on both sides.
5. Web redeploy is only needed if you changed web env and an old instance is still running without it.

## Checklist (William)

- [ ] Ran `openssl rand -hex 32` and copied the value
- [ ] Set `CRON_SECRET` on **echoaurion-company-os** (web)
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-maintenance**
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-ops-poll**
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-sync**
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-briefing**
- [ ] Triggered maintenance + ops-poll — logs show success, not `CRON_SECRET:false`
