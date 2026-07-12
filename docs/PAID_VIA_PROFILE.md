# Paid work via profile

**Status:** Company OS contract + lab harness ready. Product chrome mount waits for `feat/company-os-relay-wiring`.  
**Lab:** [`/lab/echo-chrome`](/lab/echo-chrome)  
**Price source:** `src/lib/pricing.ts`  
**Role gate:** `src/lib/work-roles.ts`

---

## Intent

Paid change requests must go through the **logged-in product avatar/profile**, not a disconnected billing form. The signer is the person signed into EchoAurion at the property.

| Rule | Detail |
|---|---|
| Signer | Profile `name` + `email` + `role` from session (lab: mock profile panel) |
| Who may sign / request builds | **ADMIN**, **DIRECTOR**, or **EXEC** only |
| Lower roles (LINE, SUPERVISOR, MANAGER) | Tech support OK; Build request shows blocked message |
| Signature | Checkbox + typed name matching profile name → stored on `WorkAgreement` |
| Authorize | **Blocked** without a `WorkAgreement` row (`code: AGREEMENT_REQUIRED`) |

Requester ≠ always the spend signer historically (`BillingContact` token). Paid-via-profile adds a mandatory agreement signed by an authorized profile **before** authorize succeeds. BillingContact token remains the second customer-side credential until product session tokens replace it.

---

## Data model

```prisma
model WorkAgreement {
  workRequestId  String @unique
  signerName     String
  signerEmail    String?
  signerRole     String   // ADMIN | DIRECTOR | EXEC
  typedSignature String
  quoteTotal     Float?
  source         String   // profile | lab | relay
  agreedAt       DateTime
}
```

Linked 1:1 to `WorkRequest`. Cascade delete with the work row.

---

## API surfaces

| Step | Endpoint | Notes |
|---|---|---|
| Lab tech intake | `POST /api/lab/echo-chrome/tech` | TEXT ticket + optional Knights + outbox |
| Lab build + agree | `POST /api/lab/echo-chrome/build` | Role gate → FEATURE + quote + `WorkAgreement` |
| Lab authorize | `POST /api/lab/echo-chrome/authorize` | Requires agreement; marks `AUTHORIZED` |
| Production work + agree | `POST /api/relay/work` + `agreement` | Role gate → QUOTED + `WorkAgreement` (`source: relay`) |
| Production authorize | `POST /api/relay/work/:id/authorize` | BillingContact token **and** agreement |

`clientKey` for lab traffic: `lab-echo-chrome` (visible in Help Desk / Inbox).

---

## Product placement

Top-right chrome (product — `feat/company-os-relay-wiring` / laughing-noether):

1. **Help Desk icon** — immediately **left of the language flag** (tech support)
2. Avatar click → profile menu → **Request a build / Pay for development** (Phase 2)
3. Role gate + WorkAgreement modal → `POST /api/company-os-relay/work` → `/api/relay/work`

Lab harness remains at Company OS `/lab/echo-chrome` for contract proof without product session.

---

## Related

- `docs/CUSTOMER_CHANGE_REQUEST_FLOW.md` — quote + two-key execute  
- `docs/RELAY_CONTRACTS.md` — product ↔ Company OS stubs  
- `/install` — Dr. OS iPhone PWA (Phase 1; Capacitor App Store = Phase 2)
