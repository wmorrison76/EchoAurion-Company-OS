# Ops Training Manual — Company OS Help Desk

**Audience:** William Morrison + future operators / hires  
**Date:** 2026-07-13  
**Tone:** Plain English, day-one steps  
**Related:** [`OPEN_OPS_CHECKLIST.md`](./OPEN_OPS_CHECKLIST.md) · [`HELP_DESK.md`](./HELP_DESK.md) · [`DILIGENCE_409A_DATAROOM.md`](./DILIGENCE_409A_DATAROOM.md)

---

## Day one — what you are operating

Company OS is the internal brain. The **Help Desk** is where live customer questions and product errors land. The **pilot app** (property floor UI) has a headset icon next to the language flag; staff pick a category and type a question. That message travels over a secure relay into Company OS. **Knights** (AI seats) may draft a reply. **You** approve before anything is sent — unless Standby is on for low-risk text. Pilots keep the last **15 days** of their Help Desk thread (server history + local cache) — viewing a reply does not wipe it.

You are not remote-controlling the property. You approve answers, quotes, and (when needed) draft pull requests.

---

## Login & navigation

1. Open Company OS → sign in (single admin).  
2. Sidebar: **Dr. OS**, **Help Desk**, **Help Files**, **Fleet**, **Support / Work**, Financial, CRM, Revenue, AurionIndex.  
3. Phone: layouts work at ~390px; use shape + text status badges (never color alone).

---

## Help Desk — daily loop

| Step | What to do |
|---|---|
| 1 | Open **Help Desk** — newest tickets first |
| 2 | Read gate badge: **Tech** (free how-to), **Billing**, **Build** (paid), **Other** |
| 3 | If Knights drafted → read draft → **Approve & send** or edit then send |
| 4 | If Build → do **not** treat as free fix; quote / WorkAgreement path |
| 5 | Resolve when done → CSAT 1–5 when prompted |
| 6 | Watch Dr. OS for drain / failed notify chips; retry dead letters from Help Desk ops |

### When **not** to use Knights

- Secrets, passwords, legal, HR, guest PII fishing  
- Anything that needs a signed contract before work  
- Core auth / middleware “just delete it” ideas — constitution blocks; escalate to human

### Standby

**Standby: Knights may approve low-risk** — only for safe TEXT how-tos. Never assumes paid Build. Turn off when you want every draft through your eyes.

### Permit / Unlock auto-send (timed)

Default: every Knights draft waits for **Approve & send**.

When you need a short window without babysitting every Tech/Other how-to:

1. Open **Help Desk** → **Permit / Unlock auto-send**
2. Pick **Expires (day + time)** — when the window ends
3. Click **◎ Unlock until…** (or **Extend until…** if already unlocked)
4. Badge shows **Unlocked until …** plus a countdown; when time passes it clears to **Locked — approve required**
5. Click **■ Lock now** anytime to require Approve & send again

**What unlocks:** low-risk TEXT **Tech** / **Other** only — same safety checks as standby `auto_answer_low_risk` (Maestro synthesis, no code-change signals, rate limit, core-path block).

**Never auto-sends:** Billing, Build/paid work, FEATURE, core/auth paths (still draft-PR only).

Audit log records `help_desk.auto_send.enable` / `.extend` / `.disable` (and `.expire` when the window lapses).

---

## Free vs paid (gates)

| Gate | Shape+label idea | Path |
|---|---|---|
| TECH | How-to / troubleshooting | Free — Knights OK |
| BILLING | Invoices, plans | Billing policy — no auto-Knights |
| BUILD | “Can you add / change the product?” | Paid — quote → authorize → execute |
| OTHER | Unclear | Triage; re-gate if needed |

**Approve free:** TECH answer ready → Approve & send.  
**Approve paid:** Quote on WorkRequest → property billing contact authorizes (token / portal) → you Execute (two-key). Stripe invoice creates when keys exist; otherwise stub/link.

Billing portal (no Dr. OS login): `/portal/billing` + token shown once when you create a billing contact.

---

## Secrets (never commit, never paste in chat logs)

| Secret | Where |
|---|---|
| `SUPPORT_INGEST_SECRET` | Company OS Render |
| `COMPANY_OS_INGEST_SECRET` | Pilot (luccca-web) — **must match byte-for-byte** |
| `CRON_SECRET` | Guards financial sync + ops crons |
| Knight API keys | Board Room / seat env |
| Twilio / Stripe / ElevenLabs | Optional; features no-op without them |

**Whoami check:** `curl` to `/api/relay/whoami` with Bearer — 401 with wrong bearer means secret is live; 503 means missing. See `CONNECT_PILOT_TO_COMPANY_OS.md`.

---

## Crons (Render)

| Job | Purpose |
|---|---|
| Financial sync | Balances / MRR snapshots |
| Ops poll | CI / deploy failure → tickets |
| Drain queue | Dead-letter / ingest jobs |
| HelpEval Friday | Classifier simulation (Thu 22:00 UTC blueprint) |
| Cost anomaly | 10× Knight burn alert |

Set `CRON_SECRET` + `WEB_SERVICE_URL` / `RENDER_SERVICE_URL`. Details: `CRON_SECRET_SETUP.md`, `RENDER_ENVIRONMENTS.md`.

---

## Fleet, canary, CSAT

- **Canary:** GLOBAL fix notifies canary properties first.  
- **Promote to fleet:** only after you are satisfied — never auto-all.  
- **CSAT:** collected on resolve and/or via relay `support.csat` panel on the property.  
- **Reliability score:** Fleet Nexus — open SYSTEM + MTTR + canary + CSAT (shape + label + number).

---

## Multilingual Help Desk → Knights (14 languages)

The pilot language picker (next to Help Desk) supports:

1. English (`en`)  
2. Español (`es`)  
3. Français (`fr`)  
4. Deutsch (`de`)  
5. Português — Brasil (`pt-BR`)  
6. Português — Portugal (`pt-PT`)  
7. Italiano (`it`)  
8. Nederlands (`nl`)  
9. 日本語 (`ja`)  
10. 한국어 (`ko`)  
11. 中文简体 (`zh-CN`)  
12. 中文繁體 (`zh-TW`)  
13. العربية (`ar`) — **RTL**  
14. עברית (`he`) — **RTL**

### What happens

1. Staff may use the app in any of the 14 UI languages.  
2. Help Desk **forwards `locale`** (and `context.locale`) with the question to Company OS.  
3. Company OS resolves language from UI locale + light script detection on the question text.  
4. Knights are instructed to **understand inbound in any of these languages**, analyze (internally in English if useful), and **draft the customer-facing reply in the user’s language**.  
5. Non-English drafts include a short **English [operator note]** at the end for you.  
6. **Runtime errors / stacks are language-agnostic** — diagnosis does not depend on UI language. Human questions still get a reply in their language.  
7. Operator SYSTEM messages stay **English LTR**. Do not reverse Arabic/Hebrew strings in the console. RTL replies are natural model output; product chrome already flips for `ar`/`he`.

### Operator tip

If a draft is English but the customer wrote Spanish (etc.), hit **Ask Knights** again after confirming the ticket’s Language SYSTEM line, or edit the reply before send.

Code: `src/lib/help-desk-locale.ts`, `support-voice.ts` (`SUPPORT_MULTILINGUAL_GUIDE`), pilot `HelpDeskChrome` + relay proxy.

---

## Help Files & Help Center

- **Help Files** (`/help-files`): internal KB + macros; mark `public` / `isMacro`.  
- **Help Center** (`/help-center`): public articles only — no login, no PII.  
- Insert macros from the Help Desk reply box.

---

## Escalation cheat sheet

| Situation | Action |
|---|---|
| Secret mismatch / Help Desk 401 | Pair ingest secrets; restart both services |
| Knights all unavailable | Check seat API keys / billing; reply manually |
| Notify-when-fixed stuck | Dead-letter panel → retry |
| PR #202 CONFLICTING | Dedicated rebase session — **never force-merge** |
| Core-path review flag | Human only — do not standby-approve |

---

## Week-one practice checklist

- [ ] Log in; open Help Desk on phone  
- [ ] Submit a TECH test question from pilot (English)  
- [ ] Submit one non-English question (e.g. Español) — confirm Language SYSTEM line + draft language  
- [ ] Approve & send; confirm property receives answer  
- [ ] Create a BUILD quote path (do not execute in prod without agreement)  
- [ ] Open `/trust` and `/help-center` logged out  
- [ ] Confirm cron list in Render Super_Admin matches `OPEN_OPS_CHECKLIST.md`

---

*Aurion Holdings, Inc. · EchoAurion Company OS*
