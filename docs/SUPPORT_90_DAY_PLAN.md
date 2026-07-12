# Support 90-Day Plan — Aggressive Sprint to #1 (Hospitality Tech Ops)

**Audience:** William Morrison  
**Date:** 2026-07-12  
**Branch:** `claude/vigilant-rubin-DtQE3`  
**Source:** `docs/SUPPORT_COMPETITIVE_ANALYSIS.md` + `docs/OPEN_OPS_CHECKLIST.md`  
**Thesis hook:** Echo wins hospitality multi-property tech ops by owning  
`error/question → tenant ticket → Knights → free/paid gate → draft-PR repair → canary/fleet notify`  
— not by copying Fin WhatsApp rates or ServiceNow CMDB.

---

## Top 5 — Automated / AI competitor capabilities (match or beat)

| # | Capability | Steal from | Why Echo must ship | Thesis hook |
|---|---|---|---|---|
| A1 | **Phone IVR → IntakeGate** (Twilio-ready, feature-flagged) | Sierra / Fin / Zendesk voice | Floor managers call; stubs already create tickets | Property-native gates (TECH/BILLING/BUILD/OTHER), not generic CX IVR |
| A2 | **Omnichannel lite: email → HelpTicket** (+ SMS status later) | Intercom / Zendesk AI | Managers live in email; in-app alone is not enough | Same `clientKey` + gate taxonomy as relay — one Help Desk, not a second inbox product |
| A3 | **Dead-letter / stuck outbox visibility + retry** | Reliability table-stakes for AI delivery | Notify-when-fixed and directives fail silently → trust dies | In-product actuation (`show_message` / `open_panel`) only works if outbox is operable |
| A4 | **Intake / omnichannel analytics live** (gate + channel) | Fin / Zendesk Insights | Prove TECH vs BUILD mix and channel mix without PII | Defends unit economics + free-vs-paid clarity competitors lack |
| A5 | **Per-customer AI cost panel completeness** | Rare in horizontal CX | 5k-tenant unit economics; cost anomaly → rate limit later | Pillar: show hospitality groups what automation costs per property |

---

## Top 5 — Human / classic ITSM capabilities (match or beat)

| # | Capability | Steal from | Why Echo must ship | Thesis hook |
|---|---|---|---|---|
| H1 | **Enforced SLA clocks + breach escalation** | Zendesk / HubSpot / Freshservice | Every buyer asks; soft 10-min copy is not enough | Shape+label breaches; gate-aware first-response + resolve clocks |
| H2 | **Post-resolve CSAT (1–5)** | Zendesk / HubSpot / Freshdesk | Quality + renewal signal; feeds HelpEval later | Closes the loop after Knights/repair — not deflection vanity |
| H3 | **Macro library UX** (Help Files insert + stubs) | Zendesk macros | Agent speed for single-operator Help Desk | Help Files already exist — wire into reply box, don’t rebuild KB |
| H4 | **Property-facing Help Center lite** | Zendesk Guide / HubSpot KB | Deflection without Fin-scale SEO CMS | Public read of tagged HelpArticles; still install-keyed narrative |
| H5 | **WorkAgreement → Stripe invoice hooks** | HubSpot / MSP PSA lite | Paid BUILD path incomplete without invoice/receipt | Free vs paid product-change commerce is a core differentiator |

---

## Also cover (P1 — after P0 vertical slices)

- Omnichannel lite SMS status updates (notify-when-fixed off-app)
- Expand HelpEval + gate regression simulations (Fin “test before live”)
- SOC2 Type II process kickoff (controls already mapped)
- Cohort messaging UI (“Safari 17 broke print BEO”)
- Cost anomaly alerts (10× Knight burn per `clientKey`)
- Billing-contact portal (quote history without full Dr. OS)
- Guest-impact / meal-period auto-escalate priority

**Explicitly defer (P2):** WFM schedules, App Marketplace, ServiceNow CMDB, Sierra-class brand voice AI, MSP RMM/remote desktop.

---

## Ideas William hadn’t emphasized (include in 90 days where cheap)

From competitive analysis §6 — schedule into P0 polish or early P1:

1. **Property reliability score** (open SYSTEM + MTTR + canary + CSAT) on Fleet Nexus  
2. **Guest-impact mode** for meal-critical modules (priority escalate; no stack traces to floor)  
3. **Standby simulation nights** (weekly HelpEval before Friday rush)  
4. **Quote → Help File draft** for T3+ paid builds (tenant-scrubbed)  
5. **Public trust page** (handshake, PR-only, canary, retention) — SOC2-prep marketing  
6. **Cost anomaly alerts** once CustomerCostSnapshot cron is live  

---

## 5-day execution backlog (ordered)

### Day 1 (this session / “24h”) — credibility P0

| # | Item | Acceptance |
|---|---|---|
| 1 | SLA clocks on `HelpTicket` + breach badges | First-response + resolve due; breached shape+label in Help Desk + analytics |
| 2 | Post-resolve CSAT 1–5 + close reason | PATCH resolve stores score; Dr. OS avg CSAT |
| 3 | Dead-letter UI + undelivered outbox retry | Help Desk ops panel; retry IngestJob + re-publish RelayOutbox |
| 4 | Macro library: HelpArticle search insert | Reply box loads articles + static macros; keyboard-friendly chips |
| 5 | Intake **channel** analytics | IN_APP / VOICE / PHONE_IVR / EMAIL chips on SupportReliabilityPanel |
| 6 | Email → HelpTicket webhook (feature-flagged) | `POST /api/webhooks/support-email` creates ticket with `intakeChannel=EMAIL` |
| 7 | Help Center lite (public read) | `/help-center` lists `public=true` articles; no PII |
| 8 | WorkAgreement `stripeInvoiceId` + link helper | Schema + authorize path stores/links invoice id when Stripe configured |
| 9 | IVR Twilio-ready polish | Menu TwiML GET; signature verify when `TWILIO_AUTH_TOKEN` set; else feature-flag bypass |
| 10 | Cost panel polish | Channel/gate context; snapshot button; docs for William verify |

### Days 2–3

- SMS status lite (Twilio Messaging feature-flagged)  
- Reliability score composite on Fleet Nexus  
- CSAT collection via relay directive to property UI  
- Stripe Invoice create-on-authorize (when keys present)  
- Dead-letter drain cron health on Dr. OS  

### Days 4–5

- HelpEval gate regressions + Friday simulation checklist  
- Cost anomaly alert → Alert row  
- Property Help Center search + panel deep-links  
- Pilot PR #202 conflict session (separate; do not force-merge)  
- Trust page draft  

---

## Acceptance criteria (P0 “done enough” for buyer conversation)

- [ ] Operator can see **⏱ On track / ▲ At risk / ✕ Breached** per ticket (shape + label)  
- [ ] Resolve flow prompts **CSAT 1–5**; Dr. OS shows average (90d)  
- [ ] Failed notify jobs + stuck outbox are **visible and retriable** without SQL  
- [ ] Email webhook (secret-gated) creates HelpTicket with gate + `EMAIL` channel  
- [ ] Macros insert from Help Files + builtins  
- [ ] Analytics show gate **and** channel mix (PII-free)  
- [ ] `/help-center` serves public articles without login  
- [ ] WorkAgreement can store `stripeInvoiceId` / hosted invoice URL  
- [ ] IVR creates tickets; Twilio verify when credentials set; otherwise documented flag  
- [ ] Customer cost table refreshable; heuristic + work spend visible  
- [ ] No secrets committed; Twilio/ElevenLabs no-op without keys  
- [ ] Colorblind-safe UI; tenant isolation preserved; draft-PR-only core unchanged  

---

## Env / Render clicks William must do (code cannot finish)

| Item | Where |
|---|---|
| `npx prisma migrate deploy` (new SLA/CSAT/email migration) | Render deploy / Neon |
| `SUPPORT_INGEST_SECRET` paired with pilot | Company OS + luccca-web |
| `SUPPORT_EMAIL_WEBHOOK_SECRET` (or reuse ingest) | Company OS — for email intake |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Optional — enables live IVR signature verify |
| `SUPPORT_IVR_WEBHOOK_SECRET` | Optional override for IVR |
| ElevenLabs TTS keys | Optional — voice replies |
| Stripe live keys already used for MRR | Needed for real Invoice create |
| Pilot PR #202 rebase | Dedicated conflict session — **do not force-merge** |

---

*Aurion Holdings, Inc. · EchoAurion Company OS · 90-day support push*
