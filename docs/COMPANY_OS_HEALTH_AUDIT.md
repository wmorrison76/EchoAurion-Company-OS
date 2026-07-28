# Company OS · Dr. OS — Health & Completeness Audit

**Date:** 2026-07-28  
**Scope:** Entire Company OS surface (not LUCCCA product modules)  
**Rule:** Moles report → William decides. No silent overnight remodel.

---

## 1. Is everything fully built?

**Short answer:** The original five CLAUDE.md modules are largely shipped and usable. The app has grown past that (Help Desk, Board Room, Fleet Nexus, Knowledge Plane, Support suite). No UI “Coming Soon” pages. Gaps are **env-gated scaffolds** and **one underbuilt infra page**, not empty shells.

| Area | Grade | Notes |
|---|---|---|
| Dr. OS | ✓ Full (+ beyond) | Status, chips, mole audit, config debt, reliability |
| Financial | ✓ Full | Plaid/Mercury/sync; Apple Wallet rent flag missing; Plaid webhook JWT TODO |
| CRM | ✓ Full | Kanban + detail; Gmail OAuth TODO |
| Revenue | ✓ Full | MRR / runway / raise / pipeline |
| AurionIndex | ▲ Partial | Static checklist — not live AWS |
| Help Desk | ✓ Full ops | Text + Knights live; Twilio phone not live |
| Board Room | ✓ Full | Multi-seat counsel |
| Support / Inbox / Pilot links | ✓ Full | **UX debt:** 4 nav destinations for related work |
| Knowledge Plane | ✓ Usable | Embeddings deferred; chunks viewer added |
| Fleet Nexus | ✓ Usable | Some honest stub graph nodes |
| Lab / Help Files / Maintenance | ✓ Full | Lab not in sidebar (intentional) |
| Public help-center / trust / billing portal | ✓ Full | English-only |

---

## 2. Live AI / call system

| Capability | Status |
|---|---|
| Knights Round Table (multi-model draft) | **Live** when API keys set |
| Auto-Knights on inbound question | **Live** (`AUTO_KNIGHTS_ON_QUESTION`) |
| Voice **dictation / paste** into Help Desk | **Live** (browser SpeechRecognition) |
| Twilio **phone IVR / live call AI** | **Not live** — webhook scaffold only |
| Twilio SMS | Scaffold / keys-gated |
| ElevenLabs TTS | Feature-flagged no-op until enabled |
| WebRTC bidirectional voice agent | **Not built** |

So: **yes, live AI for drafting** (Knights). **No**, not a live phone call system yet.

---

## 3. Help Desk UX (senior engineer pass)

**Problem:** Dry-run lived in Safe toolbelt at the **bottom** of the ticket pane; Approve sat mid-page. On 390px you scrolled past Approve to find Dry-run (or approved without seeing it).

**Fix shipped:** Sticky **Action dock** with Approve / Ask Knights / Post reply **and** compact toolbelt (Dry-run checkbox) together — no scroll chase.

**Still recommend later:**
- Reply-locale chip (force es/fr/…) — 1 click
- Consolidate Support + Help Desk into one cockpit with tabs

---

## 4. Stubs / placeholders (main program)

No greyed “Coming Soon” pages. Remaining stubs:

| Stub | Severity |
|---|---|
| Twilio IVR / SMS / TTS | High for phone GTM |
| Break-glass RDP | High (by design scaffold) |
| AurionIndex CloudWatch | Med |
| knowledge_embed / pgvector | Med |
| Gmail outreach | Med |
| Plaid webhook verify | Med |
| Railway poll | Low (Render+GitHub live) |

---

## 5. Three single-duty desk moles

| Mole | Finds | Report path |
|---|---|---|
| **Workflow** | >3–4 click paths, duplicated steps, underbuilt multi-page modules | `workflow_clicks`, `workflow_duplication`, `underbuilt_pages` |
| **UX consistency** | Chrome drift, Support vs Help Desk density, stub honesty | `ux_consistency`, `stubs_placeholders` |
| **i18n** | Company OS EN-only chrome, missing locale override chip, Help Center EN | `i18n` |

**Run (report only → you decide):**

- Dr. OS → Mole · Knights audit → **Desk moles dry-run** or **File desk-mole ticket**
- `POST /api/ops/desk-moles-run?dryRun=1` (session)
- `POST /api/ops/desk-moles-run` with Bearer `CRON_SECRET` → Help Desk TASK ticket

Night Cleaner (floor walk) remains separate; desk moles feed the same ingest shape so one ticket language.

---

## 6. Keep the system healthy — priority stack

1. **Deploy** Help Desk action dock + desk moles + mole/Knights audit  
2. **Wire** nightly night-cleaner cron (pilot scanners) + optional desk-moles cron  
3. **Consolidate** Support cockpit (tabs) — kill 4-nav duplication  
4. **Locale chip** on Help Desk tickets  
5. **Twilio** only when you want phone; until then leave scaffold dark  
6. **Promote/reject** DRAFT Knight runbooks via mole audit (anti-hallucination)  
7. **AurionIndex** live metrics or fold into Dr. OS  

---

## 7. One-page / 1–3 click doctrine (moles enforce)

- Primary operator jobs: ≤3 clicks from sidebar  
- Prefer tabs/drawers over second full pages (CRM detail drawer on mobile)  
- Approve + Dry-run must share one dock  
- Duplication = same step in two modules → file TASK, don’t auto-merge UX

---

*End of health audit · Aurion Holdings, Inc.*
