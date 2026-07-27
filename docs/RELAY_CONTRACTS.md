# Product ↔ Company OS Relay Contracts

**Status:** Company OS Pilot Connection Hub is ready (SSE + pull + standby).  
**Product repo:** wire later via `feat/company-os-relay-wiring` stubs.  
**Auth:** `Authorization: Bearer $SUPPORT_INGEST_SECRET` for support/relay;  
`Authorization: Bearer $KNOWLEDGE_INGEST_SECRET` (falls back to `SUPPORT_INGEST_SECRET`) for knowledge ingest.

**Full contract:** [`docs/PILOT_CONNECTION.md`](./PILOT_CONNECTION.md) — whoami, heartbeat, SSE stream, outbox, standby rules.

All responses use:

```ts
type APIResponse<T> =
  | { success: true; data: T; meta?: { lastUpdated: string } }
  | { success: false; error: string; code?: string }
```

---

## 1. Diagnostics

`POST /api/support/diagnostics`

```json
{
  "clientKey": "opaque-install-id",
  "label": "Miccosukee — Kitchen Line 1",
  "property": "Miccosukee Resort & Gaming",
  "appVersion": "1.2.3",
  "platform": "darwin",
  "online": true,
  "queueDepth": 0,
  "errorCount": 0,
  "health": "GREEN",
  "details": { "bounded": "json" }
}
```

No guest PII in `details`.

---

## 2. Customer questions (Ask-the-Board)

`POST /api/relay/questions`

```json
{
  "clientKey": "opaque-install-id",
  "question": "How do I re-run last night's close?",
  "context": { "screen": "close", "appVersion": "1.2.3" },
  "attachments": [
    {
      "mimeType": "image/jpeg",
      "dataBase64": "<compressed-no-data-url-prefix>",
      "altText": "Screenshot 1",
      "fileName": "close-error.jpg",
      "widthPx": 1200,
      "heightPx": 800
    }
  ]
}
```

Optional `attachments`: max **2**, PNG/JPEG/WebP, ≤ ~1.5MB each decoded (client compresses). Stored as DB bytes (EXIF stripped); operators see thumbs in Help Desk. Prefer this path over Cursor Bugbot Autofix for cost.

Pull approved answers: `GET /api/relay/questions/pull?clientKey=…`

---

## 3. Work requests (change / add-on)

`POST /api/relay/work`

```json
{
  "clientKey": "opaque-install-id",
  "kind": "FIX",
  "title": "Export missing outlet filter",
  "detail": "…",
  "requesterName": "Ops lead",
  "requesterRole": "manager"
}
```

### Paid-via-profile (optional agreement)

When the product avatar submits a build request with a signed agreement:

```json
{
  "clientKey": "opaque-install-id",
  "kind": "ADDON",
  "title": "…",
  "detail": "…",
  "tier": "T2",
  "agreement": {
    "agreed": true,
    "typedSignature": "Giovanni Genao",
    "signerName": "Giovanni Genao",
    "signerEmail": "gio@example.com",
    "signerRole": "EXEC"
  }
}
```

- `signerRole` must be **ADMIN**, **DIRECTOR**, or **EXEC** (`ROLE_GATE` otherwise).
- Typed signature must match `signerName` (case-insensitive trim).
- Creates `WorkRequest` at **QUOTED** + `WorkAgreement` (`source: relay`).
- Response: `{ id, status, agreementId, quote }`.

Customer authorize: `POST /api/relay/work/:id/authorize` (still needs BillingContact token **and** agreement)  
Pull: `GET /api/relay/work/pull?clientKey=…`

---

## 4. Knowledge telemetry (NEW — allowlisted only)

`POST /api/knowledge/ingest`

**Purpose:** Echo AI³ → Aurion Knowledge Plane. Hub-spoke only. Reject PII.

### Allowed envelope

```json
{
  "clientKey": "opaque-install-id",
  "schemaVersion": "1",
  "signalType": "ops_pattern" | "menu_hotspot" | "buying_pattern" | "system_health" | "knowledge_meta",
  "territoryCode": "US-FL-S",
  "aggregationLevel": "property" | "territory" | "network",
  "windowStart": "2026-07-01T00:00:00.000Z",
  "windowEnd": "2026-07-08T00:00:00.000Z",
  "payload": {
    "categoryAffinity": [{ "family": "seafood", "score": 0.62 }],
    "sampleSize": 1200,
    "confidence": 0.71
  }
}
```

### Forbidden keys (anywhere in body — request rejected)

`email`, `phone`, `guestName`, `guest_name`, `firstName`, `lastName`, `ssn`,
`loyaltyId`, `roomNumber`, `folio`, `reservationId`, `creditCard`, `pan`,
`address`, `dob`, `dateOfBirth`, `passport`, …

Exact list enforced in `src/lib/knowledge-ingest.ts`.

### Response

`201 { success: true, data: { id, accepted: true } }`  
`400` on schema / PII rejection  
`401` missing/invalid bearer

---

## Product client

**Not implemented here.** When product wires a thin relay client later (`feat/company-os-relay-wiring`), it must:

1. Authenticate per property to the hub (no P2P).
2. Emit only allowlisted knowledge schemas.
3. Never attach guest PII to diagnostics, questions, work, or knowledge payloads.

### Chrome / paid-via-profile test contract (Company OS)

Before mounting Help Desk + avatar chrome in LUCCCA production UI, prove the contract on Company OS:

| Path | Purpose |
|---|---|
| `/lab/echo-chrome` | Mock top-right chrome: Help Desk icon **left of** mini EchoAI avatar; Tech \| Build; role gate; paid agreement |
| `docs/PAID_VIA_PROFILE.md` | Signer = logged-in profile; `WorkAgreement` required before authorize |
| `/install` | Dr. OS iPhone 15 PWA (Add to Home Screen) |

Product avatar placement waits for pilot branch enable — do not fully wire production UI yet.
