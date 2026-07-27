# Diligence / 409A Data Room — EchoAurion Company OS (Support Plane)

**Entity:** Aurion Holdings, Inc. (dba EchoAurion)  
**Audience:** Valuation / diligence reviewers, counsel, advisors  
**Date:** 2026-07-13  
**Branch:** `claude/vigilant-rubin-DtQE3`  
**Purpose:** Light data-room narrative of **what was built** (product capability + evidence checklist).  
**Not a valuation.** No fair-market-value opinion, cap table math, or comps are implied here.

Related security / trust pointers:
- [`SECURITY_RELAY.md`](./SECURITY_RELAY.md) — threat model, triple-layer handshake, secret handling  
- [`DATA_ISOLATION_AND_COMPLIANCE.md`](./DATA_ISOLATION_AND_COMPLIANCE.md) — tenant isolation, retention, SOC/HIPAA-oriented control map  
- Public trust surface: `/trust` (handshake, draft-PR-only repair, canary → fleet, retention summary)  
- Operator training: [`OPS_TRAINING_MANUAL.md`](./OPS_TRAINING_MANUAL.md)

---

## 1. What Company OS is

EchoAurion **Company OS** is an internal Next.js business operating system (separate from the hospitality product repo). Modules include Dr. OS (admin), Financial Monitor, CRM, Revenue, AurionIndex (AWS), and a **support / Help Desk plane** that connects live to the pilot product (“luccca-web”) via a server-to-server relay.

The support plane is the diligence-relevant differentiator: it owns  
`error or floor question → tenant-isolated ticket → Knights counsel → free how-to vs paid WorkAgreement → constitutionally gated draft-PR repair → canary then fleet notify`.

---

## 2. Product capability narrative (support plane)

| Capability | What an evaluator should understand |
|---|---|
| **Help Desk** (`/help-desk`) | Operator workspace: tickets, thread, Ask Knights, approve/send, free vs charge chips |
| **Intake gates** | TECH / BILLING / BUILD / OTHER — shape+label (colorblind-safe); BUILD → paid path |
| **Knights of the Round Table** | Multi-seat AI counsel; unavailable seats skipped; drafts require approve (unless standby low-risk) |
| **Error capture → repair** | Runtime fingerprints → SYSTEM tickets → agent loop → draft PR only (core deny-list) |
| **Fleet / canary** | GLOBAL fixes: canary properties → promote → fleet notify; never silent all-tenant blast |
| **Relay** | Pilot ↔ Company OS ingest (shared secret + optional Layer-3 handshake); no remote desktop |
| **CSAT / SLA** | Post-resolve 1–5 CSAT; first-response + resolve clocks with breach labels |
| **Billing / WorkAgreement** | Quote → profile authorize → Stripe invoice when keys present; billing portal without Dr. OS login |
| **Omnichannel lite** | In-app + email/SMS/IVR webhooks (feature-flagged; Twilio no-op without keys) |
| **Multilingual Help Desk** | 14 pilot UI locales; Knights instructed to reply in the customer’s language (see §5) |
| **Help Center / Help Files** | Public `/help-center` + internal macros; Trust page `/trust` |

**IP note (non-legal):** Custom software for hospitality multi-property tech ops — tenant isolation, intake taxonomy, Knights flywheel, draft-PR-only repair, and free-vs-paid gates are product IP embodied in this repo + pilot relay. No third-party CX platform license is required for the loop described above.

---

## 3. Screens / exports checklist (for an evaluator)

### Screenshots to capture (logged-in Company OS)

1. **Dr. OS** — system status + dead-letter drain chip  
2. **Help Desk** — open ticket with gate badge, Knights draft, Approve/Send  
3. **Help Desk** — SYSTEM ticket with fingerprint / agent working  
4. **Help Files** — article with public / isMacro toggles  
5. **Fleet Nexus** — property reliability score (shape + label + number)  
6. **Support / Work** — WorkAgreement quote + authorize path  
7. **Billing portal** — `/portal/billing` token paste (no secrets in shot)  
8. **Help Center** — `/help-center` public list  
9. **Trust** — `/trust` public posture page  
10. **Analytics** — intake gate + channel mix (PII-free)

### Metrics / exports (CSV or API JSON — scrub PII)

| Export | Source | Notes |
|---|---|---|
| Ticket volume by gate / channel | Support analytics APIs / panel | No guest names |
| SLA breach rate | HelpTicket SLA fields | Shape+label statuses |
| CSAT average (90d) | HelpTicket.csatScore | Aggregate only |
| MTTR / open SYSTEM count | Fleet reliability | Per clientKey opaque |
| Customer AI cost snapshots | CustomerCostSnapshot | Heuristic; no PII |
| Audit log sample | `audit_log` | Actor + action type; redact payloads |
| WorkAgreement funnel | Quoted → authorized → executed | Dollars OK; no card data |
| Knight eval / HelpEval Friday | Ops cron outputs | Classifier scores only |

### Architecture one-pagers already in repo

- `HELP_DESK.md`, `KNIGHTS_FLYWHEEL.md`, `ERROR_CAPTURE_AND_SCOPE.md`  
- `RELAY_CONTRACTS.md`, `CONNECT_PILOT_TO_COMPANY_OS.md`  
- `SUPPORT_90_DAY_PLAN.md`, `SUPPORT_COMPETITIVE_ANALYSIS.md`  
- `OPEN_OPS_CHECKLIST.md` (Render / secret clicks still required)

---

## 4. Security posture (pointers only)

| Topic | Where to read |
|---|---|
| Ingest secrets never in browser | `SECURITY_RELAY.md` |
| Tenant isolation / fingerprint scope | `DATA_ISOLATION_AND_COMPLIANCE.md` |
| Draft-PR-only; core path deny | `CONSTITUTION.md`, `KNIGHTS_FLYWHEEL.md` |
| Handshake / replay rejection | `SECURITY_RELAY.md` § Triple-layer |
| Public marketing of controls | `/trust` |

SOC2 Type II is **process kickoff**, not claimed as certified in this data room.

---

## 5. Multilingual Help Desk (14 languages)

Pilot language picker (product UI) supports:

| # | Endonym | Code |
|---|---|---|
| 1 | English | `en` |
| 2 | Español | `es` |
| 3 | Français | `fr` |
| 4 | Deutsch | `de` |
| 5 | Português (Brasil) | `pt-BR` |
| 6 | Português (Portugal) | `pt-PT` |
| 7 | Italiano | `it` |
| 8 | Nederlands | `nl` |
| 9 | 日本語 | `ja` |
| 10 | 한국어 | `ko` |
| 11 | 中文 (简体) | `zh-CN` |
| 12 | 中文 (繁體) | `zh-TW` |
| 13 | العربية | `ar` (RTL) |
| 14 | עברית | `he` (RTL) |

**Behavior:** Help Desk forwards `locale` with the question. Knights receive UI locale + script detection, analyze (internally in English if useful), and draft the customer-facing reply in the user’s language. Runtime **error stacks remain language-agnostic**. Operator SYSTEM notes stay English LTR. Details: `OPS_TRAINING_MANUAL.md` § Multilingual.

---

## 6. Repos & branches (evidence)

| Repo | Role | Typical branch |
|---|---|---|
| `EchoAurion-Company-OS` | Support plane + Company OS | `claude/vigilant-rubin-DtQE3` |
| `Echo_Aurion-LUCCCA_Framework` | Pilot product + Help Desk chrome | `claude/laughing-noether-lSZwe` (PR #202 — do not force-merge while CONFLICTING) |

---

*Aurion Holdings, Inc. · Internal diligence aid — not a 409A appraisal*
