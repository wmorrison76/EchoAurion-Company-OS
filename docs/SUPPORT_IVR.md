# Support Phone IVR (scaffold)

Compiles **without** Twilio credentials. Production wiring is optional.

## DTMF tree

| Digit | Gate | Label |
|---|---|---|
| 1 | TECH | ◆ Tech support |
| 2 | BILLING | ● Billing |
| 3 | BUILD | ■ Paid build / change |
| 4 | OTHER | ○ Other |

## Endpoint

`POST /api/webhooks/support-ivr`

- JSON or `application/x-www-form-urlencoded` (Twilio-style `Digits`, `From`, `CallSid`, `SpeechResult`)
- Creates `CustomerQuestion` + `HelpTicket` with `intakeChannel=PHONE_IVR` and `intakeGate`
- Auth: `SUPPORT_IVR_WEBHOOK_SECRET` or `SUPPORT_INGEST_SECRET` Bearer; in non-production may accept without secret for local scaffold
- Middleware: public (excluded like GitHub webhook)

`GET /api/webhooks/support-ivr` returns the tree for operators.

## Channel enum

`IntakeChannel`: `IN_APP` | `VOICE` | `PHONE_IVR` (distinct from `HelpTicketChannel` TEXT/VOICE/FEATURE/SYSTEM).

## Next (William)

1. Buy/configure Twilio number
2. Set `SUPPORT_IVR_WEBHOOK_SECRET`
3. Point Twilio voice webhook to this URL
4. Implement full Twilio signature verify (`x-twilio-signature`)
