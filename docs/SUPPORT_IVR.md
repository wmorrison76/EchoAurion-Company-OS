# Support IVR — Phone intake

**Status:** Twilio-ready scaffold (feature-flagged). Creates real `HelpTicket` rows with `intakeChannel=PHONE_IVR` and SLA clocks.

## DTMF tree

| Digit | Gate | Shape+label |
|---|---|---|
| 1 | TECH | ◆ Tech |
| 2 | BILLING | ● Billing |
| 3 | BUILD | ■ Paid build |
| 4 | OTHER | ○ Other |

## Conversation phases (talk-to-talk)

1. **DTMF menu** — press 1–4 (unchanged).
2. **Speech intake (TECH/OTHER)** — `<Gather input="speech">`: the caller says the
   problem in their own words; the transcript seeds the ticket body.
3. **Spoken answer** — Knights draft + auto-approve run while the caller holds
   (3 × 8s hold loop). When the approved ADMIN reply lands it is **spoken back on
   the call** and also saved on the ticket. If it isn't ready in time, the caller
   gets the ticket number and a follow-up promise.
   - Only **approved** sends are voiced — drafts behind the approval gate stay silent.
   - BILLING/BUILD never auto-answer (human follow-up promised).
   - Kill switch: `SUPPORT_IVR_VOICE_ANSWER=off` → intake-only.

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
