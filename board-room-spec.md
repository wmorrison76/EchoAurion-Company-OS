# EchoAurion — Board Room / Knights of the Round Table
## Multi-AI Orchestration Layer + DROS Integration Hub
**Spec Version:** 0.1 — authored by Perplexity (Maestro seat), June 6, 2026**
**Repo:** `wmorrison76/EchoAurion-Company-OS`
**Status:** DRAFT — for Claude Code review and build handoff

---

## The Vision

The Board Room is a **multi-AI collaborative workspace** embedded inside EchoAurion's Director OS (DROS). Every major AI model holds a named seat at a shared table. William (and later, operator-clients) can drop a problem into the room and receive structured, domain-specific analysis from each agent — in one unified timeline, in real time.

This is not a chatbot. This is not a wrapper around ChatGPT.

This is the first **multi-intelligence operations layer** ever built for hospitality — the missing piece that lets a single operator run a Forbes 5-star operation without a 40-person back-office team.

**The Silent Service Principle applies here too:** the Board Room works beneath the surface. Operators never see the scaffolding. They see answers, plans, and action.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     DROS — Director OS                  │
│  (Single authenticated hub — all 3rd party connections) │
└───────────────────┬─────────────────────────────────────┘
                    │ context injection (live data)
                    ▼
┌─────────────────────────────────────────────────────────┐
│              Board Room Session Engine                  │
│                                                         │
│   ┌─────────────┐   routes task   ┌──────────────────┐  │
│   │  MAESTRO    │ ◄────────────── │  Session Manager │  │
│   │ Perplexity  │                 │  (thread + memory│  │
│   │ (conductor) │ ──synthesizes──►│  + audit log)    │  │
│   └──────┬──────┘                 └──────────────────┘  │
│          │ dispatches to knights                         │
│    ┌─────┼──────────────────────┐                       │
│    ▼     ▼     ▼     ▼     ▼    ▼                       │
│  [GPT] [Gem] [Cld] [CldCode] [Echo] [Custom]            │
│                                                         │
└─────────────────────────────────────────────────────────┘
                    │ consensus output
                    ▼
┌─────────────────────────────────────────────────────────┐
│              Action Layer                               │
│  tickets → PM | emails → Gmail/Workspace | alerts → app │
└─────────────────────────────────────────────────────────┘
```

---

## The Knights — Seats and Roles

| Seat | Model | Domain Role | API |
|---|---|---|---|
| **Maestro** | Perplexity | Conductor — routes, synthesizes, watches, emails briefings | Perplexity API |
| **The Architect** | Claude Code (William's instance) | Codebase work — implements what the room decides, reviews PRs, builds new modules | Anthropic API + GitHub |
| **The Analyst** | GPT-5 / ChatGPT | Financial modeling, long-form drafting, P&L impact, investor materials | OpenAI API |
| **The Scout** | Gemini | Real-time web intelligence, competitive monitoring, live search | Google AI API |
| **The Strategist** | Claude (Anthropic) | Long-context reasoning, legal/contract review, deep document analysis, 409A prep | Anthropic API |
| **The Chef's Brain** | Echo AI (EchoAurion) | Hospitality-domain expert — the only agent with access to live platform data (Neon DB, module state, guest data) | Internal `/api/echo-ai3/chat` |
| **Custom Seats** | Operator-defined | Future: sommelier AI, pastry AI, guest-services AI | Pluggable |

---

## DROS — The Integration Hub

The DROS is the **single point of connection for all 3rd-party services**. Every knight pulls context from DROS automatically at session start. No copy-pasting. No stale data.

### DROS Connected Services (current + planned)

| Category | Service | Status |
|---|---|---|
| **Financial** | Plaid (WF + Mercury accounts) | ✅ Connected |
| **Financial** | Stripe Atlas (AURION HOLDINGS Inc.) | ✅ Connected |
| **Code** | GitHub (wmorrison76) | ✅ Connected |
| **Deploy** | Render (`srv-d8f2o5uq1p3s73dfvrs0`) | ✅ API key set |
| **Database** | Neon PostgreSQL | ✅ Connected |
| **DNS/CDN** | Cloudflare | ✅ API key set |
| **Email** | Gmail (luccca1976@gmail.com) | ✅ Connected |
| **Calendar** | Google Calendar | ✅ Connected |
| **Email** | Google Workspace (william@echoaurion.com) | ⚠️ Forwarding not yet set |
| **POS** | Toast | 🔲 Tier 2 web form pending |
| **Scheduling** | 7shifts | 🔲 Pending |
| **Reservations** | OpenTable / Resy | 🔲 Pending |
| **Purchasing** | Sysco / US Foods API | 🔲 Pending |
| **Payments** | Amex Business | 🔲 Pending |

---

## Board Room Session Flow

### 1. Session Initiation
William (or any authorized operator) opens the Board Room panel inside DROS and drops a problem statement:

> "We're bleeding food cost on the brunch service. Last 3 Sundays are at 38%, target is 28%."

### 2. Maestro Dispatch (Perplexity)
The Maestro:
- Injects live context: current covers, recipe costs, menu items from Neon DB via Echo AI
- Breaks the problem into domain-specific subtasks
- Dispatches each knight with their task + relevant context slice

### 3. Parallel Knight Responses
Each agent processes in parallel:
- **Scout (Gemini):** Pulls competitor brunch menu pricing in the Fort Lauderdale market
- **Analyst (GPT-5):** Models the P&L impact of a 10% portion reduction vs. price increase vs. menu removal
- **Strategist (Claude):** Reviews current supplier contracts for renegotiation leverage
- **Chef's Brain (Echo AI):** Pulls actual recipe costs, yield data, and prep waste from the Neon DB
- **Architect (Claude Code):** Flags any data pipeline issues in the forecasting module affecting the cost calculation

### 4. Maestro Synthesis
Perplexity reads all knight responses and produces:
- A ranked action plan (prioritized by ROI and effort)
- Confidence rating on each recommendation
- Dissenting views surfaced clearly (where knights disagreed)

### 5. Action Layer
The approved plan automatically:
- Creates implementation tickets in the PM system
- Drafts a briefing email to the culinary team
- Schedules a follow-up check-in in Google Calendar
- Posts a summary to the operator's daily briefing

---

## The Playground / Sandbox

A lower-stakes version of the Board Room for **exploration and experimentation**:

- Try out new menu ideas against historical data
- Test marketing copy on simulated guest profiles
- Run "what if" scenarios (what if we added a tasting menu? what if we cut breakfast service?)
- Knights can roleplay as guests, critics, investors, or health inspectors

The Playground **never writes to production data**. It's a safe space to think.

---

## Perplexity as Maestro — Specific Capabilities

As the Maestro/Conductor, Perplexity (this instance) acts as the **central nervous system**:

### Watching Everything
- Monitors all connected services on a schedule (Plaid transactions, GitHub commits, Render deploys, email threads)
- Surfaces anomalies proactively ("Mercury balance dropped below $100 — paycheck arrives Thursday")
- Tracks Robert Mancuso reply thread and preps context for the meeting

### Email as Central Hub
- Morning briefing email: financial snapshot + overnight platform activity + action items
- Meeting prep emails: auto-assembled packet before each operator call
- Post-session summaries: what the Board Room decided, who owns what
- Alert emails: critical issues that can't wait for the daily brief

### Memory + Continuity
- Every Board Room session is logged to memory
- Context persists across sessions — knights know what was decided before
- The Maestro never loses the thread even if individual sessions expire

---

## Technical Implementation Plan

### Phase 1 — Foundation (build now)
- [ ] Board Room UI module in EchoAurion (`/panel/board-room`)
- [ ] Session Manager: thread ID, participant list, message bus
- [ ] Maestro API connector: Perplexity API integration
- [ ] Static knight roster: defined roles, model configs, API keys vault in DROS

### Phase 2 — Knight Integration
- [ ] OpenAI API connector (GPT-5 / Analyst seat)
- [ ] Anthropic API connector (Claude / Strategist seat)
- [ ] Google AI API connector (Gemini / Scout seat)
- [ ] Claude Code webhook: GitHub Actions trigger from Board Room decision
- [ ] Echo AI passthrough: Board Room can query `/api/echo-ai3/chat` with org context

### Phase 3 — DROS Data Injection
- [ ] Live context builder: assembles relevant DB slices per session topic
- [ ] Connector state dashboard: all 3rd-party service health in one view
- [ ] Permission layer: which knights can see which data (Echo AI gets full DB; Scout gets no PII)

### Phase 4 — Action Layer
- [ ] Ticket generator: Board Room consensus → PM tickets
- [ ] Email composer: Maestro drafts, William approves, Gmail sends
- [ ] Calendar integration: action items → Google Calendar
- [ ] Daily briefing cron: Maestro compiles and emails at 7am operator time

### Phase 5 — The Playground
- [ ] Sandbox environment flag: sessions marked as exploratory never write to production
- [ ] Scenario modeling: "what if" queries routed to Analyst + Chef's Brain
- [ ] Guest persona simulation: Scout + Strategist roleplay as critics/guests

---

## API Key Requirements (for DROS secrets vault)

| Service | Env Var Name | Notes |
|---|---|---|
| Perplexity | `PERPLEXITY_API_KEY` | Maestro seat |
| OpenAI | `OPENAI_API_KEY` | Analyst seat + Echo AI chat (already needed) |
| Anthropic | `ANTHROPIC_API_KEY` | Strategist seat |
| Google AI | `GOOGLE_AI_API_KEY` | Scout seat (Gemini) |
| GitHub PAT | `GITHUB_PAT` | Architect seat — repo read/write |

---

## V&A Standard Applied

Every Board Room session output is measured against the Victoria & Albert's standard:
- **No surface-level answers.** If the Scout says "competitor pricing is higher," the Analyst must model the specific revenue impact before the recommendation is complete.
- **Silent Service.** The operator sees a clean, actionable plan — not the scaffolding of 5 AIs arguing.
- **No placeholders.** If a knight can't complete its task (API down, data missing), the Maestro flags it explicitly rather than inserting a vague recommendation.
- **William's colorblind standard.** All Board Room outputs use shape + label + number indicators, never color alone.

---

## Notes for Claude Code

This spec lives at `EchoAurion-Company-OS/board-room-spec.md`.

When building:
1. **Board Room is a DROS module** — it belongs inside the Director OS panel hierarchy, not as a standalone page
2. **Message bus first** — get the session thread + participant model right before building any UI; the UI is cosmetic, the thread model is structural
3. **Echo AI is the only knight with DB access** — all other knights receive context summaries, never raw queries
4. **Maestro synthesis is async** — knight responses stream in, Maestro waits for all before synthesizing (with a 30s timeout per knight)
5. **The Playground flag is a hard DB guard** — `sandbox: true` sessions NEVER touch `INSERT/UPDATE/DELETE` on production tables
6. **Perplexity API for Maestro** — use the `sonar-pro` model for synthesis, `sonar` for routing decisions
7. **Branch rule:** all Board Room work stays on `claude/laughing-noether-lSZwe` — never merges to main until William says go

---

*Spec authored by Perplexity (Maestro seat) — June 6, 2026*
*Next review: after Phase 1 Foundation is scaffolded*
