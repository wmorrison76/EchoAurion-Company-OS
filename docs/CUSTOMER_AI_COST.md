# Customer AI & Seat Cost

Fleet / enterprise visibility of **estimated** AI + authorized work spend per `clientKey`. No guest PII.

## Model

`CustomerCostSnapshot` — period rollups:

- `estimatedUsd` — heuristic from Knight message count (~$0.04/msg until real token metering)
- `tokenEstimate` — rough tokens
- `callCount` — Knight help messages
- `knightSeatHits` — JSON seat → count
- `workSpendUsd` — authorized WorkRequest quotes (same month logic as spend cap)

## APIs

| Method | Path | Role |
|---|---|---|
| GET | `/api/fleet-nexus/customer-costs?days=30` | Aggregate live |
| POST | `/api/fleet-nexus/customer-costs` | Persist snapshots |
| GET | `/api/board-room/seat-counters` | Which seat helped (prompt tuning) |
| GET | `/api/work/metrics` | Open WorkAgreement quotes / hours |

## UI

Fleet Nexus → **Cost by customer** table (shape + label + `$X,XXX.XX`).

## Per-tenant ingest secrets

`SupportClient.ingestSecretHash` (sha256 hex preferred):

1. If hash set → Bearer must match that install’s secret
2. Else → fall back to shared `SUPPORT_INGEST_SECRET` (**deprecation path**)

Helpers: `src/lib/tenant-ingest-secret.ts`. Set hash via ops/admin (never commit plaintext).

## Related

Spend caps: `src/lib/spend-cap.ts` · Pricing: `docs/CUSTOMER_CHANGE_REQUEST_FLOW.md`
