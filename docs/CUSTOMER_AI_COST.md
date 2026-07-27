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
| POST | `/api/ops/cost-anomaly` | Snapshot + 10× anomaly scan → Alert (CRON_SECRET) |
| GET | `/api/board-room/seat-counters` | Which seat helped (prompt tuning) |
| GET | `/api/work/metrics` | Open WorkAgreement quotes / hours |

## Cost anomaly alerts

`src/lib/cost-anomaly.ts` compares live 30d spend to the **median** of the last ~8 `CustomerCostSnapshot` rows per `clientKey`.

- Trigger: current ≥ **10×** baseline (and current ≥ $5)  
- Dedup: one Alert per clientKey per 24h (`entityRef: cost:<clientKey>`)  
- Shape+label: `▲ Cost anomaly`  
- Cron: `POST /api/ops/cost-anomaly` with `Authorization: Bearer $CRON_SECRET`

## UI

Fleet Nexus → **Cost by customer** table (shape + label + `$X,XXX.XX`).  
Client nodes also show **property reliability score** (open SYSTEM + MTTR + CSAT).

## Per-tenant ingest secrets

`SupportClient.ingestSecretHash` (sha256 hex preferred):

1. If hash set → Bearer must match that install’s secret
2. Else → fall back to shared `SUPPORT_INGEST_SECRET` (**deprecation path**)

Helpers: `src/lib/tenant-ingest-secret.ts`. Set hash via ops/admin (never commit plaintext).

## Related

Spend caps: `src/lib/spend-cap.ts` · Pricing: `docs/CUSTOMER_CHANGE_REQUEST_FLOW.md`
