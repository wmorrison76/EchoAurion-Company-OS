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
| **Approve & send** | Official answer → `answer_ready` (+ nested directive if any) |
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
