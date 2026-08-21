# William — Render P0 clicks (this week)

Engineering cannot set Render secrets from this repo. **Nothing below was Ack'd or rotated from here.**  
Probed **2026-08-21 ~03:01 UTC**.

---

## Live public probes (done)

| Service | URL | Result |
|---|---|---|
| Company OS | `GET https://echoaurion-company-os.onrender.com/api/health` | `200` · `status ok` · `database ok` · `emailConfigured true` · `redisFanout configured` · **no `commit` / `branch` until this SHA change deploys** |
| Product | `GET https://luccca-web.onrender.com/api/health` | `200` · `ok` · `commit cb95e1fad` · `branch claude/laughing-noether-lSZwe` |
| Company OS | `GET /api/relay/whoami` (no Bearer) | `401` Unauthorized — ingest secret is **set** on COS (mismatch/missing token). Byte-match with luccca **not proven** |
| Product | `GET /api/company-os-relay/status` | `200` · `configured:true` · `hasSecret:true` · `hasUrl:true` · `clientKeyPreview` starts `micc…` — secrets exist on product; handshake still unproven |
| COS ops / whoami / status | session-gated | `307` → `/login` (expected without cookie) |

No `CRON_SECRET` in this workspace — desk-moles / stub-scan / knight-drain **not** exercised live.

---

## Exact clicks (you)

### 1. Same `CRON_SECRET` on web + every cron

Dashboard → each service → **Environment** → `CRON_SECRET` = **identical** value.

Must include (exact names):

- `echoaurion-company-os` (web)
- `echoaurion-company-os-desk-moles` (daily 11:00 UTC — moles + stub scan)
- `echoaurion-company-os-knight-drain` (`*/1` — Knights worker)
- `echoaurion-company-os-ops-poll` (`*/5`)
- `echoaurion-company-os-echo-oncall` (`*/10`)
- plus sync, briefing, maintenance, help-eval-friday, cost-anomaly, fix-digest

`sync: false` does **not** copy the value. 401 in cron logs = mismatch.  
Checklist: [`CRON_SECRET_SETUP.md`](./CRON_SECRET_SETUP.md).

### 2. Ingest secret byte-match

- Company OS: `SUPPORT_INGEST_SECRET`
- luccca-web: `COMPANY_OS_INGEST_SECRET` = **same bytes**
- Then: `curl -H "Authorization: Bearer $SUPPORT_INGEST_SECRET" …/api/relay/whoami` → relay ready  
- luccca-web `GET /api/company-os-relay/status` → `configured:true hasSecret:true`

### 3. Bring Miccosukee online

Property heartbeat + SSE. Pilot links: recent heartbeat, stream connected, pending outbox near 0.  
If online = 0, approved replies sit in `relay_outbox`. Ack is not a fix.

### 4. Ack 7-day standby review

Pilot links → **Ack all (7d)** after you **read** the pile.  
This was **not** done from engineering. Autopilot never merges.

### 5. After this code deploys

`GET /api/health` on Company OS should grow `commit` + `branch` (Render `RENDER_GIT_*`).  
Treat Autopilot as chat until **product** SHA (`cb95e1fad` at probe time — it moves) contains the fix commit.

---

## What engineering did not do

- Did not set or rotate any Render env
- Did not Ack production standby
- Did not prove knight-drain 200s (needs your cron logs)
- Did not Twilio / IVR go-live
