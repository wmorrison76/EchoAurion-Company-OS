# Support IVR — Phone intake

**Status:** Twilio-ready scaffold (feature-flagged). Creates real `HelpTicket` rows with `intakeChannel=PHONE_IVR` and SLA clocks.

## DTMF tree

| Digit | Gate | Shape+label |
|---|---|---|
| 1 | TECH | ◆ Tech |
| 2 | BILLING | ● Billing |
| 3 | BUILD | ■ Paid build |
| 4 | OTHER | ○ Other |

## Endpoints

- `POST /api/webhooks/support-ivr` — Gather digits / create ticket (TwiML or JSON)
- `GET /api/webhooks/support-ivr` — tree docs; `?twiml=1` or `Accept: text/xml` → menu TwiML

## Auth modes

1. **Twilio live:** set `TWILIO_AUTH_TOKEN` (+ `TWILIO_ACCOUNT_SID`, `TWILIO_PHONE_NUMBER`). Requests with `X-Twilio-Signature` are verified. Set `SUPPORT_IVR_PUBLIC_URL` to the exact Voice webhook URL.
2. **Bearer:** `SUPPORT_IVR_WEBHOOK_SECRET` or `SUPPORT_INGEST_SECRET`.
3. **Dev:** no secret → allowed only when `NODE_ENV !== 'production'`.

## Twilio console

1. Buy/number → Voice webhook: `https://<host>/api/webhooks/support-ivr` (POST)
2. Paste env vars on Render (never commit)
3. Test: press 1 → Help Desk shows VOICE + PHONE_IVR + ◆ Tech + SLA badge

## Related

- `docs/SUPPORT_90_DAY_PLAN.md`
- `docs/SUPPORT_VOICE.md` (dictation / TTS — separate from IVR)
