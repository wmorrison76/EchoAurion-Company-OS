# Pending Help Desk — William Morrison (2026-07-28)

**Status:** Blocked on pilot Help Desk screenshot send (`Maximum call stack size exceeded`) — fix queued for deploy.

## Intake

| Field | Value |
|---|---|
| Gate | TECH |
| Reporter | William Morrison |
| Surface | Help Desk chrome (Chronos panels) |
| Attachments | 2 screenshots — Menu & Wine Pairing, AI Recommendations |

## Summary

Chronos-related panels (**Menu & Wine Pairing**, **AI Recommendations**) show updated or finished UI/UX that is **not exposed** and **does not follow Chronos look-and-feel**. Requesting a **deep dive update — top priority**.

## Operator actions after fix deploys

1. Confirm William can resubmit with 2 screenshots from Help Desk.
2. Triage visuals in Help Desk console attachment viewer.
3. Knights / William: audit Chronos panel chrome vs design system; align Menu & Wine Pairing + AI Recommendations to Chronos V&A standard.
4. Close loop on pilot with reply via relay when fix is verified.

## Technical note

Root cause of send failure: client `blobToBase64` spread + server `stripJpegExif` spread on large JPEG buffers — fixed in framework + Company OS relay ingest (Jul 2026).
