# CRON_SECRET setup (Render)

Crons fail with `[cron] Missing CRON_SECRET` when the secret is unset on that cron service. The **same** value must exist on the web service and every cron.

## 1. Generate (local — do not commit)

```bash
openssl rand -hex 32
```

Copy the output. Never paste it into git, PRs, or chat logs.

## 2. Paste on web service

1. Render Dashboard → **echoaurion-company-os** (web)
2. **Environment** → find or **Add** `CRON_SECRET`
3. Paste the generated value → **Save Changes**

## 3. Paste SAME value on EVERY cron

Repeat for each cron service (Environment → `CRON_SECRET` → same value → Save):

| Cron service | Purpose |
|---|---|
| `echoaurion-company-os-maintenance` | Hourly maintenance dispatch |
| `echoaurion-company-os-sync` | Daily financial sync |
| `echoaurion-company-os-briefing` | Daily board briefing |

Blueprint already declares `CRON_SECRET` with `sync: false` on web + all three crons. You still must type the value in the dashboard (or Manual Sync after setting once).

`WEB_SERVICE_URL` is wired via Blueprint `fromService` → web `RENDER_EXTERNAL_URL`. Confirm it is set on each cron if Blueprint sync lagged.

## 4. Redeploy / clear cache if needed

After saving env vars:

1. Web: **Manual Deploy** → **Clear build cache & deploy** (so the app sees `CRON_SECRET`)
2. Or trigger a one-off cron run from the cron service page to verify

## Checklist (William)

- [ ] Ran `openssl rand -hex 32` and copied the value
- [ ] Set `CRON_SECRET` on **echoaurion-company-os** (web)
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-maintenance**
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-sync**
- [ ] Set the **same** `CRON_SECRET` on **echoaurion-company-os-briefing**
- [ ] Redeployed web (or cleared build cache) if the web env was newly added
- [ ] Triggered maintenance cron (or waited for hourly) — log shows `[cron] OK`, not Missing CRON_SECRET
