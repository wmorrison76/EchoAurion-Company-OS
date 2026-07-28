# Pending Help Desk — William Morrison (2026-07-28)

**Status:** Pilot fix LIVE (`luccca-web` @ `6d2fbce59`). Company OS: draft-prefix leak fixed + auto-send through **2026-08-31** on `claude/vigilant-rubin-DtQE3`.

## Intake

| Field | Value |
|---|---|
| Gate | TECH |
| Reporter | William Morrison |
| Surface | Help Desk chrome (Chronos panels) |
| Attachments | 2 screenshots — Menu & Wine Pairing, AI Recommendations |

## Summary

Chronos-related panels (**Menu & Wine Pairing**, **AI Recommendations**) show updated or finished UI/UX that is **not exposed** and **does not follow Chronos look-and-feel**. Requesting a **deep dive update — top priority**.

## Root cause — draft prefix leaked to customer

Knights were prompted to draft *for William to review*. Auto-approve / Approve & send forwarded the raw KNIGHT body to `answer_ready` with **no customer-copy sanitize**, so the pilot thread showed:

`Draft reply for William to review: --- Thanks for flagging…`

**Fix (Company OS):** `sanitizeCustomerFacingAnswer()` strips internal prefixes before every outbound send (`approveHelpTicket`, `maybeStandbyAutoApprove`, Send to client). Knight prompts updated to forbid that framing.

## Auto-send through August 2026

| Lever | Value through 2026-08-31 |
|---|---|
| `HELP_DESK_AUTO_APPROVE` | `true` (default) — all TEXT TECH/OTHER auto-send after Knights |
| `ECHO_AUTO_APPROVE` | `true` (default) — Echo silent-radio path |
| `HELP_DESK_AUTO_SEND_TECH` | `true` in `render.yaml` — permit/env unlock for TECH |
| `HELP_DESK_AUTO_SEND_UNTIL` | `2026-08-31T23:59:59.999Z` — DB permit bootstrap + seed |
| `standby_settings.helpDeskAutoSendUntil` | Upserted on `getStandbyConfig()` if missing/shorter |

BUILD / BILLING / `needsHumanCoreReview` / core merge stay locked.

## Fix a ticket already sent with bad prefix

1. **Help Desk console** → open ticket → paste a clean reply (prefix removed) → **Send to client now** (or **Approve & send** if still `AWAITING_APPROVAL`).
2. **API:** `POST /api/help-desk/tickets/{id}/send-to-client` with `{ "message": "<clean text>" }` — sanitize runs server-side.
3. **Bulk:** `POST /api/ops/approve-all-awaiting` only helps tickets still in `AWAITING_APPROVAL`; for `RESOLVED` with bad text, use Send to client.

## Operator actions after fix deploys

1. Deploy Company OS branch `claude/vigilant-rubin-DtQE3` (or merge tip).
2. Confirm Render env: `HELP_DESK_AUTO_APPROVE=true`, `HELP_DESK_AUTO_SEND_TECH=true`, `HELP_DESK_AUTO_SEND_UNTIL=2026-08-31T23:59:59.999Z`.
3. William hard-refresh pilot + resubmit Chronos ticket (or Send to client on existing ticket with clean copy).
4. Knights / Architect: audit Chronos panel chrome vs design system; align Menu & Wine Pairing + AI Recommendations to Chronos V&A standard.

## Technical note

Root cause of **send failure** (Jul 2026): client `blobToBase64` spread + server `stripJpegExif` spread on large JPEG buffers — fixed in framework + Company OS relay ingest.
