# Connect a NEW buyer / property to Company OS

One-pager for a **second** property or a standalone Company OS sale.  
Do **not** reuse `CLIENT_KEY=miccosukee-pilot`. Phone IVR is **not** live.

Miccosukee-specific paste list: [`CONNECT_PILOT_TO_COMPANY_OS.md`](./CONNECT_PILOT_TO_COMPANY_OS.md).  
Relay contract: [`PILOT_CONNECTION.md`](./PILOT_CONNECTION.md).

---

## Pastes (generate once, never invent a default)

```bash
openssl rand -hex 32    # SUPPORT_INGEST_SECRET = COMPANY_OS_INGEST_SECRET (identical bytes)
# CLIENT_KEY = opaque id, e.g. buyer-acme-resort-2026 — never miccosukee-pilot
```

| Where | Env | Value |
|---|---|---|
| Company OS (`echoaurion-company-os`) | `SUPPORT_INGEST_SECRET` | Generated secret |
| Buyer product (luccca-web or their app) | `COMPANY_OS_INGEST_SECRET` | **Same bytes** |
| Buyer product | `COMPANY_OS_URL` | `https://echoaurion-company-os.onrender.com` |
| Buyer product | `CLIENT_KEY` | Unique opaque id |
| Company OS (Chef's Brain, optional) | `ECHO_AI_URL` | `https://<buyer-host>/api/company-os/echo-brain` |
| Company OS | `ECHO_AI_KEY` | Same as buyer `ECHO_BRAIN_SECRET` (or ingest secret) |

`COMPANY_OS_INGEST_SECRET` has **no** inventable default. Missing → product 503.

---

## Smoke curls (in order)

Replace `$OS`, `$SECRET`, `$CLIENT_KEY`.

```bash
OS=https://echoaurion-company-os.onrender.com
SECRET=   # SUPPORT_INGEST_SECRET — do not commit
CLIENT_KEY=buyer-acme-resort-2026

# 1. Company OS is up (after this week's deploy: commit + branch)
curl -sS "$OS/api/health"
# Expect: status ok, database ok, commit (7-char SHA), branch

# 2. whoami — byte-match
curl -sS -H "Authorization: Bearer $SECRET" "$OS/api/relay/whoami"
# Expect: success, relay ready. 401 = secret mismatch.

# 3. Product relay status (luccca-web example)
curl -sS https://<buyer-host>/api/company-os-relay/status
# Expect: configured:true hasSecret:true

# 4. Heartbeat
curl -sS -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d "{\"clientKey\":\"$CLIENT_KEY\",\"label\":\"Buyer property\",\"online\":true}" \
  "$OS/api/relay/heartbeat"

# 5. SSE (browser or curl — keep open)
curl -sS -N -H "Authorization: Bearer $SECRET" \
  "$OS/api/relay/stream?clientKey=$CLIENT_KEY"

# 6. First Help Desk TEXT — property asks a question via product relay.
# Then: /help-desk shows TEXT ticket. Approve & send = chat, not a deploy.
```

---

## Phone honesty (step 7 — say this out loud)

IVR webhook exists (`/api/webhooks/support-ivr`). **No live Twilio number.**  
Voice today = Help Desk browser dictation / paste. SMS stubs without Twilio keys.  
Do not sell 24/7 phone. No phone SLA in the contract.

---

## Failure signs

| Sign | Meaning | Fix |
|---|---|---|
| `GET /api/relay/whoami` → **401** | Ingest secret byte mismatch or unset | Re-paste identical `SUPPORT_INGEST_SECRET` / `COMPANY_OS_INGEST_SECRET`. Redeploy both. |
| Product relay `configured:false` / `hasSecret:false` | Buyer env missing | Set `COMPANY_OS_URL` + `COMPANY_OS_INGEST_SECRET`. |
| Dr. OS **Pilots online 0** | No heartbeat in 5 min | Property must POST `/api/relay/heartbeat` with this `CLIENT_KEY`. |
| **Outbox pile** + stream idle | Property offline | Ack is not a fix. Wait for heartbeat + SSE. See Pilot links. |
| Ticket RESOLVED, guest UI still broken | Autopilot was chat | Check product `/api/health` SHA. UI is fixed only when that SHA contains the fix commit. |
| Knights never draft | `CRON_SECRET` drift on knight-drain | Same secret on web + `echoaurion-company-os-knight-drain`. |
| Desk moles silent | `CRON_SECRET` on desk-moles cron | Same secret. Logs 401 = mismatch. |

---

## Autopilot vs SHA

Autopilot / Approve = TEXT + `answer_ready`. It never merges luccca-web.  
Company OS `/api/health` → `commit` + `branch`. Product `/api/health` already publishes SHA.  
Call a **UI** bug fixed only when the **product** health SHA includes the fix commit.

---

## Related

- [`CONNECT_PILOT_TO_COMPANY_OS.md`](./CONNECT_PILOT_TO_COMPANY_OS.md) — Miccosukee / luccca-web clicks  
- [`CRON_SECRET_SETUP.md`](./CRON_SECRET_SETUP.md) — web + every cron, including desk-moles and knight-drain  
- [`WILLIAM_RENDER_P0.md`](./WILLIAM_RENDER_P0.md) — this week's Render clicks (not done from this repo)
