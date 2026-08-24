# William — Render P0 clicks (this week)

Engineering cannot set Render secrets from this repo. **Nothing below was Ack'd or rotated from here.**  
Live picture updated **2026-08-22** from Perplexity’s check. **Do not reopen ingest as unproven.**

---

## Live public probes (fact)

| Service | URL | Result |
|---|---|---|
| Company OS | `GET https://echoaurion-company-os.onrender.com/api/health` | `200` · still **no `commit` / `branch`** — old build. origin/main now includes health SHA **and** heartbeat `lastSyncAt` stamp. Manual Deploy of `main` is still required. |
| Product | `GET https://luccca-web.onrender.com/api/health` | `200` · `commit 99914df40` · `branch claude/laughing-noether-lSZwe` (current — leave it) |
| Company OS | `GET /api/relay/whoami` (no Bearer) | `401` — expected without token |
| Ingest handshake | luccca-web `POST /api/company-os-relay/heartbeat` | **MATCHED.** `200` with COS payload `{ success, data: { clientId: cmrjze9ga0004wlrwo40y2m89, health: RED, serverTime } }`. Company OS authenticated the call. |
| Miccosukee | SupportClient | Registered / online enough to get a real `clientId`. **`health: RED` is not an ingest miss** (see below). |
| COS ops / whoami / status | session-gated | `307` → `/login` (expected without cookie). Perplexity cannot Ack or read outbox. |

12 Render services: **1 web + 11 crons**. `CRON_SECRET` is `sync: false` on all except `db-backup` (that cron talks to Neon directly and does not declare `CRON_SECRET`).

---

## What Miccosukee `health: RED` means

**Not a fire. Not an ingest failure.** HTTP 200 + a real `clientId` means the secret matched and the row upserted.

`POST /api/relay/heartbeat` stores whatever `computeHealth()` returns (`src/lib/support.ts`). It does **not** look at SSE, outbox, or a stale prior `lastHealth` — every successful call overwrites `lastHealth`.

RED (“At risk” — shape + label, not color alone) when **any** of:

| Condition | File |
|---|---|
| `lastSyncAt` missing **and** the running build does not stamp ingest time (old Render SHA) | `src/lib/support.ts` `computeHealth` |
| Explicit `lastSyncAt` older than 72 hours | same |
| `queueDepth > 50` | `src/lib/support.ts` |
| `errorCount > 10` | `src/lib/support.ts` |

On current `main`, keep-alives that omit `lastSyncAt` stamp **ingest time** (`resolveHeartbeatLastSyncAt`). After you deploy this SHA, a healthy keep-alive should return GREEN (unless queue / errors / an old explicit `lastSyncAt`). **Live COS is still the old SHA-less build** — until Manual Deploy, Miccosukee can still come back RED. Colorblind UI labels this **At risk**, not a red dot alone.

SSE is a **separate** field (`lastStreamAt` via `GET /api/relay/stream` → `touchStreamConnected`). Missing stream does **not** set RED. Outbox drain also needs the stream, not a greener heartbeat.

**Plain English:** Miccosukee is **online enough to register**. RED = “no recent sync timestamp in the payload” (or a huge queue / error burst). Still to do after deploy: SSE connected + pending outbox near 0. Colorblind UI already labels this **At risk**, not a red dot alone.

---

## Exact remaining clicks (you)

### 1. Manual deploy of Company OS `main`

Dashboard → `echoaurion-company-os` → **Manual Deploy** of latest `main` (must include health SHA + lastSyncAt stamp).  
Then `GET /api/health` must show `commit` + `branch`. Until that, live is the old SHA-less build and keep-alives can still return RED.

### 2. Same `CRON_SECRET` on web + every cron that declares it

Dashboard → each service → **Environment** → `CRON_SECRET` = **identical** value.  
`sync: false` does **not** copy the value. 401 in cron logs = mismatch.

Must include:

| Service | Notes |
|---|---|
| `echoaurion-company-os` | web (verifier) |
| `echoaurion-company-os-sync` | |
| `echoaurion-company-os-briefing` | |
| `echoaurion-company-os-maintenance` | |
| `echoaurion-company-os-knight-drain` | `*/1` — Knights worker |
| `echoaurion-company-os-ops-poll` | `*/5` |
| `echoaurion-company-os-echo-oncall` | `*/10` |
| `echoaurion-company-os-desk-moles` | daily 11:00 UTC |
| `echoaurion-company-os-help-eval-friday` | **still needs paste** |
| `echoaurion-company-os-cost-anomaly` | **still needs paste** |
| `echoaurion-company-os-fix-digest` | **still needs paste** |
| `echoaurion-company-os-db-backup` | **does not declare `CRON_SECRET`** — Neon API only; skip unless you add one later |

Checklist: [`CRON_SECRET_SETUP.md`](./CRON_SECRET_SETUP.md).

### 3. Ack 7-day standby review (needs COS login)

Pilot links → **Ack all (7d)** after you **read** the pile.  
Perplexity cannot do this. Autopilot never merges.

### 4. After deploy — re-run heartbeat

1. Confirm COS `/api/health` has `commit` + `branch` (latest main / `main`).
2. Re-run luccca-web heartbeat (same path that already returned 200).
3. Expect another `clientId` + `health`. After this SHA is live, omitted `lastSyncAt` should **not** force RED. **At risk** only when sync is actually stale, queue > 50, or errors > 10.
4. Then: property SSE connected, Pilot links pending outbox near 0. Ack is not a fix for a piled outbox.

---

## What engineering did not do

- Did not set or rotate any Render env
- Did not Ack production standby
- Did not prove knight-drain 200s (needs your cron logs)
- Did not Twilio / IVR go-live
- Did **not** fail ingest — that handshake is **MATCHED**
