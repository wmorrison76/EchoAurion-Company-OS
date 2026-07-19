# Dr. OS — Complete Checklist

Nerve-center status for `/dr-os`. **Code/docs vs William clicks.**

Last updated: 2026-07-18 (branch `claude/vigilant-rubin-DtQE3`).

---

## Code-done (no Render click required)

| Surface | Status |
|---|---|
| System Status tally (GitHub, Render, Neon, Stripe, users, pilot) | ✓ |
| Connection health panel + **rollup into System Status** | ✓ |
| Dead-letter drain chip + **rollup into System Status** | ✓ |
| Knights watching chip | ✓ |
| Night Cleaner “last night” chip (score / tasks / ticket deep-link) | ✓ |
| HelpEval Friday chip (latest run + Friday cron marker) | ✓ |
| Cost-anomaly chip (open alerts + last scan audit) | ✓ |
| Nerve-center deep links (Fleet · Help Desk · Financial · Knowledge) | ✓ |
| Support & reliability analytics panel | ✓ |
| Neon response ms + **pool size** when `connection_limit` in `DATABASE_URL` | ✓ |
| Stripe MRR + **next billing** (soonest period end + amount) | ✓ |
| Night Cleaner ingest API `POST /api/ops/night-cleaner-report` | ✓ |
| HelpEval Friday cron route `POST /api/ops/help-eval-friday` | ✓ |
| Cost anomaly cron route `POST /api/ops/cost-anomaly` | ✓ |
| Railway failure ingest | **Optional skip** — webhook scaffold only; poll returns `skipped` |
| Zero “Coming Soon” on `/dr-os` | ✓ |

### Status payload extras

`GET /api/dr-os/status` (SSE) now includes:

- `pilotConnection`, `drain`, `nightCleaner`, `helpEval`, `costAnomaly`
- `neon.poolSize`, `stripe.nextBillingTotal` / `nextBillingAt`

---

## William-when-well (secrets / crons only)

Do these in the Render dashboard when healthy. **No secrets in git.**

1. **`CRON_SECRET`** on web **and each cron service** (see `docs/CRON_SECRET_SETUP.md`).
2. **Ops poll cron** — `echoaurion-company-os-ops-poll` → `POST /api/ops/poll-failures` (every ~5m). Without it, drain chip stays “never / stale”.
3. **HelpEval Friday cron** — Thu `0 22 * * 4` UTC → `POST /api/ops/help-eval-friday` with Bearer `CRON_SECRET`.
4. **Cost anomaly cron** — daily (after financial sync) → `POST /api/ops/cost-anomaly`.
5. **Night Cleaner** — pilot/night script → `POST /api/ops/night-cleaner-report` (Bearer `CRON_SECRET`). Until first ingest, chip shows “No night report yet”.
6. **`SUPPORT_INGEST_SECRET`** paired with luccca-web `COMPANY_OS_INGEST_SECRET` (byte-identical).
7. Optional: `PRODUCT_DATABASE_URL` for Active Users; Stripe / Neon / Render keys if any panel shows Unavailable.
8. Optional: retire Railway — no further wiring required.

Full secret matrix: [`OPEN_OPS_CHECKLIST.md`](./OPEN_OPS_CHECKLIST.md).

---

## Acceptance smoke (after deploy)

- [ ] `/dr-os` loads; nerve-center row links work
- [ ] System Status counts include Connection + Drain (+ Night Cleaner / HelpEval / Cost when unknown)
- [ ] Knights + Drain chips refresh without page crash
- [ ] Night Cleaner / HelpEval / Cost chips show shape + label (never color-only)
- [ ] Neon shows ms; pool only if URL has `connection_limit`
- [ ] Stripe shows MRR; next billing when ≥1 active sub

---

## Out of scope for “Dr. OS complete”

- Pilot EKG→Night Cleaner mapper (product repo) — Company OS accepts reports already
- Pilot PR #202 rebase
- SOC2 / diligence screenshots (separate docs)
