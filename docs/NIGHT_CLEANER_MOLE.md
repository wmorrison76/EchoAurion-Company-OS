# Night Cleaner Mole — Morning Open Readiness

**Audience:** William Morrison  
**Date:** 2026-07-14  
**Repos:** Pilot EKG Panel Sweep (`Echo_Aurion-LUCCCA_Framework`) + Company OS Help Desk / Dr. OS  
**Tag before build:** `pre-night-cleaner-mole-20260714` (Company OS) — create before large runner work  
**Thesis:** Night cleaners do not remodel the hotel. They walk every corridor after close, leave a **task list** on the desk for morning open, and never merge code in silence.

---

## 1. Pitch (plain English)

Hotels don’t trust “self-healing robots” overnight. They trust **night cleaners**: people who walk guest and back-of-house paths after close, note what’s broken or unfinished, and leave a checklist so day shift can open clean.

The **Night Cleaner Mole** is that walk for Echo:

- Equip the existing **EKG Panel Sweep** (and a small headless cron) as hospitality night cleaners.
- Catch what guests and operators will see at morning open.
- **Do not auto-fix** product code or silent-merge PRs.
- Produce a **Morning Open Report** + optional Help Desk **SYSTEM / TECH task tickets** William can triage.

If something is wrong at 6am, the report says ✕ with a shape+label — never a green dot alone.

---

## 2. What already exists (pilot mole)

| Asset | Path | Role today |
|---|---|---|
| Panel Sweep runner | `client/modules/EKGSystem/telemetry/panelSweepRunner.ts` | Mounts every `PANEL_REGISTRY` key off-screen while EKG is open; records ok/slow/blank/timeout/error |
| Sweep store / UI | `ekgStore` + `PanelSweepDashboard.tsx` | Live pass status for Dr. OS–class operators |
| Panel registry | `client/lib/panel-registry.ts` | Source of truth for “rooms” on the floor |
| Types | `client/modules/EKGSystem/types.ts` → `PanelSweepResult` | Per-panel probe result |

**Gap:** Sweep runs when EKG is mounted (browser). Night cleaner needs a **scheduled + reportable** pass that also covers static scans (placeholders, links, npm audit, secrets) and feeds **Company OS as tasks**, not only local telemetry.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PILOT (luccca / Echo_Aurion-LUCCCA_Framework)                │
│                                                              │
│  A. Browser mole (existing)                                  │
│     EKG open → panelSweepRunner → ekgStore + telemetry       │
│                                                              │
│  B. Night cron (new, prefer headless)                        │
│     nightly 02:00 property TZ (or UTC after close)           │
│       ├─ static scanners (placeholders, deep-links, i18n…)   │
│       ├─ optional Playwright smoke (guest + operator paths)  │
│       ├─ npm audit / secrets grep / a11y smoke               │
│       └─ aggregate → NightCleanerReport JSON                 │
│              │                                               │
│              ▼ POST Bearer CRON_SECRET / SUPPORT_INGEST       │
└──────────────┼──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  COMPANY OS                                                   │
│  POST /api/ops/night-cleaner-report                           │
│       ├─ validate + redact (no PII)                           │
│       ├─ audit_log: ops.night_cleaner.ingest                  │
│       ├─ optional markdown artifact (Dr. OS / ops inbox)      │
│       └─ HelpTicket channel=SYSTEM, gate=TECH                 │
│            subject: "Night cleaner · Morning open · {date}"   │
│            body: checklist of ✕ / ▲ / ✓ findings              │
│            fingerprint: night-cleaner|{repo}|{runDate}        │
│            → TASK for William — never auto-merge              │
└─────────────────────────────────────────────────────────────┘
```

### Triggers

| Mode | When | Use |
|---|---|---|
| **Nightly cron** (primary) | After property close / before open (e.g. 02:00–05:00) | Full report + Help Desk ticket |
| **EKG-open sweep** (existing) | Operator has EKG mounted | Live mole; can *export* last pass into report shape |
| **Pre-deploy / CI** (secondary) | PR or Render pre-promote | Deploy-readiness subset (Sentry, CVE, secrets) — still report, don’t merge |

### Out of scope (hard)

- Auto-fix production or draft-PR without dual control  
- Silent merge of any PR  
- Capturing guest names, emails, room numbers, card data, or live POS payloads  
- Replacing Knights / HelpEval Friday sim (complementary — sim tests classifiers; night cleaner tests the floor)

---

## 4. Report schema (contract)

Canonical TypeScript: `src/types/night-cleaner.ts`.

### Status labels (colorblind-safe)

| Shape | Code | Meaning |
|---|---|---|
| ✓ | `ok` | Ready for morning open |
| ▲ | `warn` | Openable but needs day-shift attention |
| ✕ | `error` | Blocks morning open / launch-tier path |

Never ship color-only status in the report UI or ticket body.

### Top-level shape (summary)

```ts
NightCleanerReport {
  schemaVersion: 1
  runId: string
  startedAt / finishedAt: ISO
  source: 'cron' | 'ekg_export' | 'ci'
  productLine: 'echoaurion' | 'company-os' | …
  repo: string                 // e.g. wmorrison76/Echo_Aurion-LUCCCA_Framework
  gitSha?: string              // short SHA only
  environment: 'staging' | 'production' | 'local'
  overall: { status, shape, label, score0to100 }
  telemetrySummary: { … }     // counts only — no event payloads with PII
  categories: NightCleanerCategoryResult[]
  tasks: NightCleanerTask[]    // actionable checklist → Help Desk
  expandIdeas?: string[]       // optional “William isn’t thinking of”
}
```

Each **task** becomes a checklist line on the SYSTEM ticket (or a child finding). Prefer **one rollup ticket per night per productLine** (fingerprint dedupe) over ticket spam.

---

## 5. Checklist categories (top 10 + expand)

Hospitality framing: guest corridor vs staff corridor.

### Top 10 (build first)

| # | Category | What night cleaners check | Guest vs operator |
|---|---|---|---|
| 1 | **Broken links & deep-links** | Dead `href`s, dead panel keys, 404 routes | Both |
| 2 | **Unfinished pages / stubs** | “Coming soon”, TODO, placeholder, lorem, greyed no-ops | Both |
| 3 | **Panel registry integrity** | Sidebar/nav keys missing from `PANEL_REGISTRY`; orphan loaders | Operator |
| 4 | **Blank / crash / slow panels** | EKG sweep blank/timeout/error/slow | Operator (guest panels if registered) |
| 5 | **Role gates (Chronos-class)** | Launch-tier roles getting 403 on promised paths | Operator |
| 6 | **Empty states vs bugs** | Empty lists that look broken (no CTA / no label) | Both |
| 7 | **i18n missing keys** | Raw key leakage in 14 pilot locales | Guest-facing first |
| 8 | **Env / config drift** | Relay secret, Stripe, ingest handshake whoami | Ops |
| 9 | **Deploy readiness** | Sentry unresolved spike, `npm audit` high/critical, secrets-in-repo | Ops |
| 10 | **Program completion backlog** | Explicit “still undone for program completion” task list | William |

### Expand ideas (William isn’t thinking of)

| Idea | Why it matters at morning open |
|---|---|
| **Guest-path vs operator-path separate checklists** | Front desk open ≠ kitchen Chronos ready |
| **Mobile 390px smoke** | William reviews on iPhone; layouts that break at 390px fail open |
| **Multi-browser smoke** | Safari iPadOS print/BEO class failures already in cohort lore |
| **Accessibility smoke** | Missing `aria-label` on interactive / status icons (constitution) |
| **Bundle size / Lighthouse lite** | Slow first paint = “broken” to a manager at open |
| **Integration heartbeat stale** | POS/PMS/7shifts last-success older than SLA → ▲ before guests arrive |
| **Telemetry summary** | Error rate / blank-panel trend overnight — counts only |
| **Dependency CVE** | `npm audit --omit=dev` high/critical → deploy hold ▲/✕ |
| **Secrets in repo scan** | `.env`, private keys, webhook secrets in tree → ✕ |
| **Sentry + security / code-quality** | Unresolved issues on release; ESLint/tsc gate for promote |
| **Dead panel registry keys** | Nav points at ghosts — classic “room on map, door missing” |
| **Meal-period guest-impact modules** | BEO / schedule / POS-adjacent fail → escalate priority on ticket |

---

## 6. Help Desk / Dr. OS intake — TASKS, not silent merges

### Ticket policy

| Field | Value |
|---|---|
| `channel` | `SYSTEM` |
| `intakeGate` | `TECH` |
| `intakeChannel` | `IN_APP` (cron is ops; not EMAIL) |
| `priority` | `HIGH` if any ✕ guest-path; else `NORMAL` / `HIGH` for ✕ operator-path |
| `productLine` | from report |
| `moduleHint` | `night-cleaner` |
| `errorCategory` | `UI` / `INFRA` / `INTEGRATION` by dominant category |
| `fingerprint` | `night-cleaner\|{productLine}\|{YYYY-MM-DD}` |
| `agentWorking` | `false` — mole does **not** start Knights autofix by default |
| `needsHumanCoreReview` | `false` unless secrets/CVE ✕ |

### Body format (example)

```
Night cleaner · Morning open readiness · 2026-07-14
Overall: ▲ Needs day-shift attention (72/100)

Guest path
  ✕ deep-link /events/beo → 404
  ▲ empty state on banquet list (no CTA)
  ✓ i18n en/es sample keys present

Operator path
  ✕ panel chronos-pnl blank after 5s
  ▲ role gate 403 for launch-tier on reports
  ✓ PANEL_REGISTRY keys match sidebar

Deploy readiness
  ▲ npm audit: 2 high (no critical)
  ✓ secrets scan clean
  ✓ relay whoami OK

Tasks (do not auto-merge)
  [ ] Fix BEO deep-link
  [ ] Chronos PnL blank — EKG error …
```

### What never happens

- Mole does not open draft PRs without constitution + dual control  
- Mole does not resolve its own tickets  
- Mole does not include PII, stack traces with cookies, or raw Sentry event payloads — IDs and counts only

---

## 7. Security & privacy

1. **No PII in reports** — no names, emails, room numbers, phone, card, free-text guest notes.  
2. **Redact** env values — report “Stripe configured: ✓/✕”, never keys.  
3. **Auth** — `Authorization: Bearer $CRON_SECRET` (same pattern as help-eval-friday / cost-anomaly). Optional secondary: ingest secret for pilot→OS.  
4. **Tenant isolation** — fingerprint and `clientKey` use repo/productLine ops keys (`github/…`), not property guest keys, unless scanning a named staging `clientKey` hash.  
5. **Audit** — every ingest → `audit_log` action `ops.night_cleaner.ingest`.  
6. **Retention** — report JSON treated like KnowledgeSignal / ops artifacts (see DATA_ISOLATION); scrub after policy window.

---

## 8. Headless path outline (Playwright not fully wired)

Prefer a **script first**, browser later:

```
# Pilot repo (outline)
scripts/night-cleaner/
  run.ts                 # orchestrates scanners → writes report.json + report.md
  scanners/
    panel-registry.ts    # dead keys / orphans
    placeholder-copy.ts  # coming soon / TODO / lorem
    deep-links.ts        # static route + href extract
    i18n-keys.ts
    npm-audit.ts
    secrets-scan.ts
    env-heartbeat.ts     # whoami / stripe configured flags
  optional/
    playwright-smoke.ts  # guest-path + operator-path @ 390px — stub until wired
  ship.ts                # POST report to Company OS
```

Company OS already scaffolds **intake**: `POST /api/ops/night-cleaner-report`.

Until Playwright is wired: cron runs static scanners + optional EKG export JSON drop; ticket still opens with whatever categories ran (`skipped` marked `? Unknown` / omitted from score).

---

## 9. Schedule recommendation

| Environment | Cron | Notes |
|---|---|---|
| Staging | Daily 06:00 UTC | Catch before William’s morning |
| Production pilot | Daily ~02:00 property local (or 06:00 UTC) | After close, before open |
| Company OS | Optional weekly self-scan of OS UI | Lower priority |

Render: add Blueprint cron `echoaurion-night-cleaner` → pilot script **or** OS endpoint that only *ingests* (runner lives with the product that has panels).

Suggested OPEN_OPS line: `CRON_SECRET` + nightly POST of report to `/api/ops/night-cleaner-report`.

---

## 10. Build sequence (next week)

1. **Freeze tag** `pre-night-cleaner-mole-20260714` on Company OS (and pilot when starting runner work).  
2. Land this doc + report types + ingest API stub (this change).  
3. Pilot: export last EKG pass → `NightCleanerReport` mapper.  
4. Pilot: static scanners (placeholders, registry orphans, npm audit, secrets).  
5. Company OS: Help Desk ticket creation from ingest (scaffold in this PR).  
6. Dr. OS chip: last night overall ✓/▲/✕ + link to ticket.  
7. Playwright guest/operator 390px smoke (stub → real).  
8. Wire Render cron + OPEN_OPS click for William.

---

## 11. Related docs

- [`SUPPORT_90_DAY_PLAN.md`](./SUPPORT_90_DAY_PLAN.md) — standby sim nights; night cleaner is floor walk  
- [`OPEN_OPS_CHECKLIST.md`](./OPEN_OPS_CHECKLIST.md) — cron + secret clicks  
- [`SUPPORT_COMPETITIVE_ANALYSIS.md`](./SUPPORT_COMPETITIVE_ANALYSIS.md) — reliability differentiation  
- [`HELP_EVAL.md`](./HELP_EVAL.md) — Friday classifier sim (complementary)  
- [`ERROR_CAPTURE_AND_SCOPE.md`](./ERROR_CAPTURE_AND_SCOPE.md) — SYSTEM tickets, no PII  
- Pilot: `client/modules/EKGSystem/telemetry/panelSweepRunner.ts`

---

*Aurion Holdings, Inc. · EchoAurion · night cleaners → morning open*
