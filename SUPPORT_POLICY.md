# Support Policy — Free vs Charge

EchoAurion Company OS tech support is built for hospitality operators: **helpful by default**, clear when work is billable, and never robotic.

Canonical code: `src/lib/support-policy.ts` (classifier + category lists).  
Voice for AI drafts: `src/lib/support-voice.ts`.  
Pricing floors/tiers: `src/lib/pricing.ts` (T1–T5).

William’s **Approve free** / **Send quote** / **Decline** buttons remain authoritative. UI chips are guidance only.

---

## 10-minute answer rule

**Aim to answer informational questions in under ~10 minutes** — warm, clear, ready for the floor.

If a clear how-to, status check, config walk-through, or “is this a bug?” triage can be resolved in that window, **keep it free**. Do not force a quote for being helpful.

---

## Free vs Charge matrix

| | **Free** | **Charge** |
|---|---|---|
| **Shape** | ✓ Free answer · ◇ Complimentary fix? | $ Quote required |
| **Typical** | How-to, config guidance, diagnosis, status, product behavior, bug triage | Custom feature/add-on, data model, integrations, migrations, bespoke reports, code beyond config, T2+ implementation |
| **Action** | Draft → Approve & send (Ask the Board) | Knights draft plan → Send quote (or Approve free if gifted) |

### Free (examples)

- How-to questions (“Where do I find…?”)
- Config guidance (existing toggles / settings)
- Troubleshooting **diagnosis** (what’s wrong — without shipping a code change)
- Status checks (sync healthy? job finished?)
- Answers answerable in under ~10 minutes
- Clarifying expected product behavior
- “Is this a bug?” triage (reproduce + classify; the **fix** may still be billable)

### Charge (examples)

- Custom feature / add-on
- Data model changes
- New integrations / connectors
- Migrations & cutovers
- Bespoke reports / exports
- Anything needing a **code change beyond config**
- T2+ implementation work (see pricing tiers)

### Complimentary (founder discretion)

Trivial T1-style fixes (copy, label, single toggle) may show **◇ Complimentary fix?** — still your call to **Approve free** or quote at the T1 floor.

---

## Day-to-day flow (`/support`)

```
Customer / product → Ask the Board or Change Request
        ↓
Policy chip recommends Free / Complimentary / Quote (+ suggested tier)
        ↓
Knights draft answer or plan (human hospitality voice)
        ↓
YOU: Approve & send  |  Approve free  |  Send quote  |  Decline
        ↓ (if charged)
Billing contact authorizes → YOU Execute (rollback ref required)
```

Nothing ships without your approval.

---

## AI draft voice

Drafts must sound like a hospitality operator: short paragraphs, plain English, empathy, concrete next steps, **never invent capabilities**, never leak internal/code names. See `src/lib/support-voice.ts`.
