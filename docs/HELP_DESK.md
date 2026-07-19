# Help Desk — Knights of the Round Table

Operator workspace for live support tickets in EchoAurion Company OS.

**Route:** `/help-desk`  
**Help Files:** `/help-files`  
**Not this:** Board Room (strategy counsel), Support (client health + approve gate), Inbox (unified triage).

---

## What v1+ does

| Capability | Status |
|---|---|
| Text tickets (CRUD + thread) | Live |
| Voice call **dictation / paste** → `HelpVoiceNote` | Live |
| Ask the Knights → drafts in-thread | Live (approve before official) |
| Feature / “can you add this” → FEATURE + optional `WorkRequest` | Live |
| Free vs Charge policy chips | Live |
| **Send to client now** → outbox `show_message` + `answer_ready` | Live |
| **Open panel for client** → `open_panel` directive | Live |
| **Send help article** → message + optional panel | Live |
| **Contextual Help** (KB search + Knights + suggested directives) | Live |
| Client delivery status (outbox pending/delivered) | Live |
| Help File KB (`HelpArticle`) | Live — `/help-files` |
| Guided E2E test scenario | Live |
| Twilio / real phone number | **Not yet** |
| Multilingual (14 pilot locales → Knights reply in user language) | Live — see `OPS_TRAINING_MANUAL.md` |
| Pilot Help Desk **thread history** (15 days, `GET /api/relay/questions`) | Live — pull still one-shot; history does not mark delivered |
| **Payroll / compensation hard refuse** | Live — Knights skipped; safe refuse draft + operator note; never standby auto-send |
| **Screenshot attachments** (max 2 × ~1.5MB, DB bytes, ~90d retention) | Live on **pilot** Help Desk: browse / drag-drop / paste (Ctrl/⌘V); compress + EXIF strip client-side. Company OS shows thumbnails for Approve — no customer-facing Approve copy on pilot |
| **Echo AI priority queue** | Live — **silent night-shift radio**: product auto-files TECH tickets with `source: echo_ai` / `echoPriority` without telling the pilot; intake channel `ECHO`, priority `URGENT`, badge **◆ Echo AI**, sorts above normal TEXT; tighter SLA (15m first response / 2h resolve). Auto-Knights still TECH/OTHER; BUILD locked. Includes panel slow-load (`action: open_panel`, `panelId`, `elapsedMs`). |
| **Live repair delivery** | Live — Approve & send pushes soft directives over SSE. **Echo AI tickets** push `echo_repair_ready` to Echo only (no user toast / Help Desk chrome / reload). Non-Echo code notices use `banner_only`; pilot auto-reload is **OFF** unless `ECHO_SOFT_RELOAD=true`. |

---

## Where to click

| Goal | Where |
|---|---|
| Live tickets | Sidebar → **Help Desk** |
| Knowledge base / macros | Sidebar → **Help Files** |
| Contextual ask from overview | **Dr. OS** → Contextual Help widget |
| Heartbeat / SSE / standby | **Pilot links** |

### Ticket actions (need `clientKey` on the ticket)

| Button | What it does |
|---|---|
| **Approve & send** | Official answer → `answer_ready` (+ nested directive / `echo_repair_ready`). **Does not merge or deploy code.** Stamps `closeReason` (`reply_sent_code_pending` vs how-to/fix). See `docs/TICKET_VS_CODE_FIX_AUDIT.md`. |
| **Send to client now** | Posts reply + `show_message` + `answer_ready` (does not require resolve) |
| **Send + open panel** | Same as send, plus `open_panel` for the selected panelId |
| **Open panel** | Only `open_panel` / `directive` for that clientKey |
| **Insert / Send article** | Insert into reply box, or push article body (+ article.panelId if set) |
| **Ask Knights (contextual)** | Searches Help Files, drafts answer, suggests directives — **nothing sent until you approve/send** |

Pilot must be on product branch `feat/company-os-relay-wiring` (flag on) to honor `open_panel` / `show_message`. Until then, events sit in `relay_outbox` (pending → delivered when SSE connects).

---

## Directive schema (client-facing)

Pushed via `RelayOutbox` and SSE (`event:` name matches `type`, plus a mirrored `directive` event):

```ts
// show_message
{ type: "show_message", title: string, body: string, severity?: "info"|"success"|"warning"|"error" }

// open_panel — panelIds in src/lib/help-panels.ts
{ type: "open_panel", panelId: string, params?: Record<string, unknown> }

// navigate
{ type: "navigate", path: string }

// answer_ready (existing)
{ questionId, question, answer, directive, standbyApproved? }
```

Known Echo-like panels: `beo`, `schedule`, `purchasing`, `settings`, `support`, `menu`, `inventory`, `forecast`, `close`, `fleet`, plus Company OS stubs (`company-os.help-desk`, …).

---

## Help Files API

| Method | Path | Notes |
|---|---|---|
| GET/POST/PATCH | `/api/help-files` | Auth; CRUD list/create/update |
| GET | `/api/help-files/search?q=` | Auth; title/body/slug/tags |

Seed: 14 starter articles (login, BEO print, Ask support, Fleet, Company OS operator topics, …).

---

## Standby (24/7)

Modes: `off` | `draft_only` | `auto_answer_low_risk`.  
Auto-answer is **TEXT how-to only** — never auto-execute code or FEATURE work. See `docs/PILOT_CONNECTION.md`.

### Timed auto-send permit

On `StandbySettings`: `helpDeskAutoSendEnabled` + `helpDeskAutoSendUntil`.  
Help Desk UI: **Permit / Unlock auto-send** with day+time expiry. While `now < until`, low-risk TEXT Tech/Other may auto-send via the same `maybeStandbyAutoApprove` path (does not permanently flip standby mode). BUILD/BILLING never auto-send. See Ops Training Manual → *Permit / Unlock auto-send*.

### Env unlock — `HELP_DESK_AUTO_SEND_TECH`

Set `HELP_DESK_AUTO_SEND_TECH=true` on the **web** service to allow low-risk TEXT **Tech / Other** auto-send after Knights draft (same safeguards: Maestro, no code-change signal, rate limit, core-path block). **BUILD stays locked** (no auto-Knights, no auto-send). Default unset/false — use timed permit or standby mode instead.

### Echo AI auto-approve — `ECHO_AUTO_APPROVE`

For tickets with `source: echo_ai` / intake channel `ECHO` / `echoPriority` (silent night-shift radio):

| Setting | Behavior |
|---|---|
| **Unset or `true`** (default — testing) | After Knights draft (or soft refuse / greeting), **auto-approve & send** without William Approve. Always emit `echo_repair_ready`. Soft TEXT / triage / policy refuse auto-send. |
| `ECHO_AUTO_APPROVE=false` | Dual-control back — William Approve & send (same as pre-testing). Alias: `HELP_DESK_ECHO_AUTO_APPROVE`. |

**Still never auto:** BUILD gate, payroll *disclose* (safe refuse text may auto-send), core-path merge, silent production merge.  
**NEEDS_CODE_CHANGE / core review:** auto-ack Echo with “repair in progress / try again when live” + `echo_repair_ready`; ticket stays `AWAITING_APPROVAL` for William / draft PR — no auto-merge.

**Production:** set `ECHO_AUTO_APPROVE=false` on the Render web service when dual-control is required again.

### SLA while AWAITING_APPROVAL

SLA clocks **pause** when status is `AWAITING_APPROVAL` (William is the bottleneck). UI shows **▲ Awaiting Approve** — not ✕ Breached. Breach stamps and the Breached filter exclude this queue state.

### Greeting auto-send (TECH / OTHER TEXT)

Simple presence pings (`hi`, `how are you`, `are you active`, …) auto-send a short friendly reply when a Knights draft exists, or generate one if not. **BUILD / BILLING stay locked.** Knights watching continues for real support asks.

### Knights watching chip

Help Desk + Dr. OS show **Knights watching** (seats configured, auto-Knights flag, last convene, ops-poll/cron freshness). Stale cron usually means `CRON_SECRET` missing on cron services — see `docs/CRON_SECRET_SETUP.md`.

---

## Status flow

```
OPEN → WAITING (customer msg)
     → WITH_KNIGHTS → AWAITING_APPROVAL → (Approve / Send to client) → RESOLVED or WAITING
     → RESOLVED / CLOSED
FEATURE: Approve free → RESOLVED | Send quote → WAITING (+ WorkRequest QUOTED)
```

---

## Redeploy

1. `prisma migrate deploy` (includes `20260710220000_help_articles`)
2. Optional: `npx prisma db seed` for Help Articles if empty
3. Confirm `/help-files` and Help Desk client-delivery panel
4. Smoke: ticket with clientKey → Send to client now → outbox Pending → pilot SSE → Delivered

---

*Aurion Holdings, Inc. · EchoAurion Company OS*
