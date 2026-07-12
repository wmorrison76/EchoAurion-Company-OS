# Support SMS — status lite + inbound webhook

**Status:** Twilio-ready scaffold (feature-flagged). Creates `HelpTicket` with `intakeChannel=SMS`. Outbound status texts stub when Twilio Messaging keys are unset.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/webhooks/support-sms` | Inbound text → HelpTicket + SLA clocks |
| POST | `/api/webhooks/support-sms` `{ "action":"status", ... }` | Outbound status SMS (or stub) |
| GET | `/api/webhooks/support-sms` | Capability docs |

## Auth

Bearer `SUPPORT_SMS_WEBHOOK_SECRET` or `SUPPORT_INGEST_SECRET`.  
Production rejects requests when neither secret is set.

## Inbound payload

```json
{
  "text": "Print BEO button grey on iPad",
  "gate": "TECH",
  "clientKey": "optional-install-key",
  "fromHash": "opaque-sha-prefix",
  "messageSid": "optional-provider-id"
}
```

Never store raw E.164 on the ticket — use `fromHash` / `sms:<hash>` clientKey hint.

## Outbound status

```json
{
  "action": "status",
  "toE164": "+15551234567",
  "ticketId": "clxyz…",
  "status": "RESOLVED",
  "subject": "Print BEO",
  "clientKey": "optional"
}
```

Requires `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_PHONE_NUMBER` for live send. Without keys → `mode: "stubbed"` + audit `support.sms.status_stub`.

## Twilio console (optional)

1. Messaging webhook → `https://<host>/api/webhooks/support-sms` (adapt Twilio form → JSON proxy, or call with Bearer from a Worker)
2. Paste env on Render (never commit)

## Related

- `docs/SUPPORT_IVR.md` (voice)
- `docs/SUPPORT_90_DAY_PLAN.md`
