# Pilot Connection Hub — Product ↔ Company OS Contract

**Audience:** Future product (LUCCCA / FLIGHTDZINE) agent wiring the pilot sidebar.  
**Status:** Company OS is production-ready for real-time. Product stubs live on a separate branch.  
**Auth:** `Authorization: Bearer $SUPPORT_INGEST_SECRET` (or signed stream `?token=` for EventSource).

All JSON responses:

```ts
type APIResponse<T> =
  | { success: true; data: T; meta?: { lastUpdated: string } }
  | { success: false; error: string; code?: string }
```

Pilot-facing error codes: `RELAY_DISABLED`, `UNAUTHORIZED`, `CLIENT_KEY_REQUIRED`,
`CLIENT_KEY_INVALID`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_CLIENT_MISMATCH`,
`SCHEMA`, `PII_REJECTED`, `KNOWLEDGE_DISABLED`, `HEARTBEAT_FAILED`, `PULL_FAILED`.

---

## Env (Company OS / Render)

| Variable | Required | Purpose |
|---|---|---|
| `SUPPORT_INGEST_SECRET` | yes for pilots | Bearer for `/api/relay/*` + `/api/support/diagnostics` |
| `KNOWLEDGE_INGEST_SECRET` | optional | Bearer for `/api/knowledge/ingest` (falls back to SUPPORT) |
| `KNIGHTS_STANDBY_MODE` | optional | `off` \| `draft_only` \| `auto_answer_low_risk` (DB toggle overrides) |
| `STANDBY_MAX_AUTO_PER_HOUR` | optional | Rate limit for standby auto-answers (default `10`) |

Product env (later): `COMPANY_OS_URL`, `COMPANY_OS_INGEST_SECRET`, `CLIENT_KEY`,
`COMPANY_OS_RELAY_ENABLED=false` (default off).

---

## 1. Whoami / health

`GET /api/relay/whoami`

```http
Authorization: Bearer $SUPPORT_INGEST_SECRET
```

```json
{ "success": true, "data": { "ok": true, "service": "echoaurion-company-os", "relay": "ready", "serverTime": "…", "unixMs": 0 } }
```

---

## 2. Canonical heartbeat

`POST /api/relay/heartbeat`

```json
{
  "clientKey": "opaque-install-id",
  "label": "Miccosukee — Kitchen Line 1",
  "property": "Miccosukee Resort & Gaming",
  "online": true,
  "queueDepth": 0,
  "errorCount": 0,
  "appVersion": "1.2.3",
  "platform": "darwin"
}
```

Upserts `SupportClient`, sets `lastHeartbeatAt` / `lastHealth`, audits, raises CRITICAL alert on **RED**.

Keep-alive bodies may omit `lastSyncAt`. The server stamps **ingest time** (`resolveHeartbeatLastSyncAt`) so a successful keep-alive is not RED by design. Send an explicit `lastSyncAt` only when reporting a distinct data-sync timestamp. **At risk** (shape + label, not color alone) when that timestamp is older than 72h, `queueDepth > 50`, `errorCount > 10`, or the caller still uses a build that treats a missing sync as never-synced. See `docs/WILLIAM_RENDER_P0.md`.

`POST /api/support/diagnostics` uses the **same** helper and also writes a `DiagnosticSnapshot`. Prefer heartbeat for keep-alive; use diagnostics when you need a full snapshot.

---

## 3. Real-time push (SSE)

`GET /api/relay/stream?clientKey=opaque-install-id`

Auth options:

1. `Authorization: Bearer $SUPPORT_INGEST_SECRET`
2. Signed query token (EventSource): `?clientKey=…&token=<base64url.payload>.<hmac>`

Token payload: `{ "clientKey": "…", "exp": <unix> }` HMAC-SHA256 with `SUPPORT_INGEST_SECRET`.  
Server helper: `createStreamToken(clientKey)` in `src/lib/relay-auth.ts`.

### Events

| `event:` | When |
|---|---|
| `answer_ready` | William, Help Desk send, or standby approved a question |
| `work_status` | Work quoted / in progress / executed / rolled back |
| `directive` | Structured directive (mirrors open_panel / show_message / navigate / answer directive) |
| `show_message` | Operator pushed an in-app message to the client |
| `open_panel` | Operator asked the pilot to open a panel (`panelId` + optional `params`) |
| `navigate` | Operator asked the pilot to navigate to a path |
| `maintenance_notice` | Scheduled or immediate maintenance / major-update blast (also mirrored as `show_message`) |
| `feature_available` | GLOBAL/COHORT fix available (also mirrors update banner) |
| `update_available` | Soft “Update ready” banner after code deploy / product fix |
| `soft_reload` / `client_update` | Ask pilot to soft-reload (preserve drafts; never silent wipe) |
| `ping` | Live keep-alive (~25s); not persisted to outbox |

### Directive payloads

```json
{ "type": "show_message", "title": "Support reply", "body": "…", "severity": "info" }
{ "type": "open_panel", "panelId": "beo", "params": null }
{ "type": "navigate", "path": "/settings" }
{ "type": "maintenance_notice", "noticeId": "…", "title": "…", "body": "…", "severity": "info"|"warning"|"error", "windowStart": null, "windowEnd": null }
{ "type": "update_available", "title": "Update ready", "body": "…", "updateDirective": "soft_reload" }
{ "type": "soft_reload", "reason": "Fix is live — applying without losing your work.", "preserveDrafts": true }
```

### Maintenance notices

Compose and schedule at `/maintenance` (Super Admin). Delivery:

1. Resolves targets: all `support_clients`, one `clientKey`, or `property` match
2. Writes `RelayOutbox` rows: `maintenance_notice` + `show_message` + `directive`
3. Raises an in-app Alert (+ optional web push) for William when it fires
4. Cron: `POST /api/maintenance/dispatch` with `Authorization: Bearer $CRON_SECRET` (hourly in `render.yaml`)

Pilots should honor `event: maintenance_notice` when present; older builds can fall back to the mirrored `show_message`.

Panel IDs are listed in Company OS `src/lib/help-panels.ts` (Echo-like: beo, schedule, purchasing, settings, support, …). Help Desk **Send to client** / **Open panel** / **Send article** publish these into `relay_outbox`. See `docs/HELP_DESK.md`.

Payload shape (data JSON):

```json
{
  "id": "outbox-or-ephemeral-id",
  "clientKey": "…",
  "type": "answer_ready",
  "payload": { "questionId": "…", "question": "…", "answer": "…", "directive": null, "standbyApproved": false },
  "createdAt": "…"
}
```

### Outbox durability

Table `relay_outbox` (`RelayOutbox`): undelivered rows survive restarts. On connect, the stream flushes undelivered events then marks `deliveredAt`. In-memory bus fans out to live subscribers. Help Desk shows pending/delivered per ticket clientKey.

### Pull fallback (keep working)

- `GET /api/relay/questions/pull?clientKey=…`
- `GET /api/relay/work/pull?clientKey=…`

---

## 4. Ingest (questions / work / knowledge)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/relay/questions` | Requires `clientKey`; upserts SupportClient |
| POST | `/api/relay/work` | Requires `clientKey`; never auto-executed |
| POST | `/api/knowledge/ingest` | PII keys rejected (`PII_REJECTED`) |
| POST | `/api/relay/work/:id/authorize` | Billing contact token |

See also `docs/RELAY_CONTRACTS.md`.

---

## 5. Knights standby (when William unavailable)

Operator UI: **Support → Pilot links** or Help Desk standby toggle.  
Modes: `off` | `draft_only` | `auto_answer_low_risk` | elite dial `assist` | `standby` | `autopilot`.

### What Autopilot / standby does vs does NOT do

| Does | Does NOT |
|---|---|
| Auto-answer low-risk TEXT after Knights + safeguards | Merge PRs or deploy `luccca-web` |
| Push `answer_ready` (+ `echo_repair_ready` for Echo) into relay outbox | Soft-reload the pilot (default OFF) |
| Stamp tickets RESOLVED with disposition (`reply_sent_code_pending` / how-to) | Clear the product bug until SHA is on `laughing-noether` |
| Leave items in **Standby approved — review queue** for William audit | Auto-dismiss that queue (William must **Ack** or wait 7d window) |

If the pilot is **offline** / **SSE disconnected** / **outbox pending**, Autopilot may still “succeed” in Company OS while the property never receives the reply — reconnect the pilot stream to drain outbox.

### Accuracy safeguards (enforced in `src/lib/standby.ts`)

1. **TEXT how-to / triage only** — never auto FEATURE / WorkRequest / code execute  
2. **≥2 knight seats RESPONDED + Maestro synthesis** — Architect/code-change language → force AWAITING_HUMAN  
3. **Policy gate** — `QUOTE_REQUIRED` or complimentary-fix-needing-code → never auto-approve  
4. **Audit** — every auto-action is `actor: computer_agent` with full draft snapshot  
5. **UI** — “Standby approved — review queue” for William (Ack / Ack all clears `standbyApproved`)  
6. **Rate limit** — `STANDBY_MAX_AUTO_PER_HOUR` (DB or env)

Work requests: Knights may **draft + suggest quote** in standby; only William **Execute**.

---

## 6. Operator surfaces

| Route | Purpose |
|---|---|
| `/support/pilot-links` | Clients, heartbeat, stream, standby toggle, review queue |
| `/dr-os` | “Pilot connection” online count + Contextual Help widget |
| `/help-desk` | Ask Knights → send to client / open panel / Help Files |
| `/help-files` | Searchable KB articles (cite + send to client) |

---

## 7. Product wiring checklist (later)

1. Feature flag `COMPANY_OS_RELAY_ENABLED=false` by default  
2. Sidebar entry “Ask Aurion Support” (hidden when flag off)  
3. Heartbeat every 60s → `POST /api/relay/heartbeat`  
4. Open SSE → `/api/relay/stream` (reconnect + pull fallback)  
5. Never send guest PII  

See product branch `feat/company-os-relay-wiring` and `docs/COMPANY_OS_RELAY_WIRING.md`.
