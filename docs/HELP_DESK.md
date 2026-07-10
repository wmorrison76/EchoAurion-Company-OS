# Help Desk — Knights of the Round Table

Operator workspace for live support tickets in EchoAurion Company OS.

**Route:** `/help-desk`  
**Not this:** Board Room (strategy counsel), Support (client health + approve gate), Inbox (unified triage).

---

## What v1 does

| Capability | Status |
|---|---|
| Text tickets (CRUD + thread) | Live |
| Voice call **dictation / paste** → `HelpVoiceNote` | Live (browser SpeechRecognition + textarea) |
| Ask the Knights → drafts in-thread | Live (approve before official) |
| Feature / “can you add this” → FEATURE + optional `WorkRequest` | Live |
| Free vs Charge policy chips | Live (`support-policy.ts`) |
| Audit log on mutations | Live |
| Customer relay intake | Later (stubs only) |
| Twilio / real phone number | **Not yet** — do not block on it |

---

## IA map (so William can find it)

| Surface | Job |
|---|---|
| **Help Desk** | Live tickets: reply, Ask Knights, voice log, custom builds |
| **Inbox** | Triage queue → deep-link into Help Desk (`?import=question:id` / `work:id`) |
| **Support** | Client health, diagnostics, questions/work panels |
| **Board Room** | Multi-AI strategy counsel — not the help desk |

---

## What you weren’t asking — but should decide

These gaps will bite once volume rises. Plan them before the first busy week.

### 1. SLA / response time targets
You already want **&lt;10 minutes** for free informational answers (`FREE_ANSWER_TARGET_MINUTES`). Decide:
- Target for WAITING / AWAITING_APPROVAL
- What “breached” looks like in the UI (shape + label, not color alone)
- Whether voice calls get a tighter SLA than text

### 2. Escalation matrix
| Tier | Who | When |
|---|---|---|
| L1 | You (William) | Free answers, triage, Approve free |
| L2 | Knights drafts | How-to, diagnosis, plan drafts — you still approve |
| L3 | Billable engineer / Architect seat | Quoted T2+ work after billing contact authorizes |

Write the handoff rules so Knights never silently become “the answer.”

### 3. Identity of requester
Only the **designated billing contact** can authorize spend (`BillingContact` model). Capture:
- Role at property (GM, FOH lead, IT, billing)
- Whether the person asking can authorize — if not, route quote to billing contact

### 4. Audit trail
`audit_log` already exists. Help Desk writes:
- `help_desk.ticket.create` / `.update` / `.import`
- `help_desk.message.create`
- `help_desk.knights.dispatch`
- `help_desk.ticket.approve`
- `help_desk.voice.create`

Keep every Approve / Quote / Resolve audited.

### 5. After-hours / on-call
PWA push is already in the stack. Decide:
- Quiet hours vs always-on for CRITICAL
- Who gets woken for voice vs text
- Auto-ack macros for after-hours

### 6. Knowledge base / macros
v1 ships a stub macro list in the Help Desk reply box. Next:
- Expand canned replies per property type
- Link macros to Knowledge Plane insights (no guest PII)

### 7. Multilingual
Hospitality crews are often bilingual. Decide:
- Which languages you answer in
- Whether Knights draft in the requester’s language
- Translation review before Approve

### 8. Guest-facing vs operator/system issues (privacy)
Separate:
- **Guest issues** (PII-sensitive, property-owned) — minimize retention in Company OS
- **Operator / system issues** (sync, config, product behavior) — normal Help Desk tickets

Never put guest PII into Knowledge Plane or vendor exports.

### 9. Intake channels
| Channel | Now | Later |
|---|---|---|
| Manual Help Desk | ✓ | |
| Inbox → Help Desk import | ✓ | |
| In-app relay (`/api/relay/...`) | Partial (questions/work) | Wire to auto-create HelpTicket |
| Email | — | Inbound parse → ticket |
| Phone number | — | Twilio → transcript → VOICE ticket |

### 10. CSAT / close reason
On RESOLVED/CLOSED, capture:
- Close reason (answered / quoted / duplicate / spam / escalated)
- Optional 1–5 CSAT when relay can ask the property

### 11. When NOT to use Knights
Do **not** Ask the Knights for:
- Secrets, credentials, API keys
- Legal advice or contract interpretation as final counsel
- HR / personnel issues
- Anything that must not leave your device / vault

Use Board Room Strategist only with deliberate, redacted prompts — or handle yourself.

### 12. Vendor vs client help desk (later)
Knowledge Plane vendor scrutiny is separate. A future **vendor help desk** must not share client ticket threads. Keep client Help Desk isolated.

---

## Status flow

```
OPEN → WAITING (customer msg)
     → WITH_KNIGHTS → AWAITING_APPROVAL → (Approve) → RESOLVED
     → RESOLVED / CLOSED
FEATURE: Approve free → RESOLVED | Send quote → WAITING (+ WorkRequest QUOTED)
```

---

## Redeploy

After merge/push to the deploy branch:

1. Render runs `prisma migrate deploy` (migration `20260710180000_help_desk`)
2. Confirm `/help-desk` appears in the sidebar
3. Smoke: New ticket → Ask Knights → Approve & send; Log voice call; Request custom build

---

*Aurion Holdings, Inc. · EchoAurion Company OS*
