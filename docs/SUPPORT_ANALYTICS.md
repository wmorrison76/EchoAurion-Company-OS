# Support Analytics — Dr. OS

PII-free aggregates for gate/channel mix, SLA, CSAT, MTTR, dead-letter, fingerprints.

**API:** `GET /api/dr-os/support-analytics`  
**UI:** `SupportReliabilityPanel` on `/dr-os`

## Metrics

| Metric | Notes |
|---|---|
| Tickets by `intakeGate` | TECH / BILLING / BUILD / OTHER / Unset — shape+label |
| Tickets by `intakeChannel` | IN_APP / VOICE / PHONE_IVR / EMAIL / SMS |
| SLA open | ✕ Breached · ▲ At risk · ✓ On track |
| CSAT average | Mean 1–5 over scored resolves (90d) |
| MTTR proxy | Mean create→resolve hours (90d) |
| Dead-letter notify | Failed `notify_fanout` IngestJobs |
| Stuck outbox | Undelivered RelayOutbox older than 5m |
| Top fingerprints | Truncated; no guest PII |

See `docs/SUPPORT_90_DAY_PLAN.md`.
