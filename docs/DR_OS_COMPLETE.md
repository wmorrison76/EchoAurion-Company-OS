# Dr. OS — Complete Checklist

Nerve-center status for `/dr-os`. **Code/docs vs William clicks.**

Last updated: 2026-07-19 (branch `claude/vigilant-rubin-DtQE3`).

---

## Honest split: env/config vs exception flywheel

| What you see | What it is | Who fixes it |
|---|---|---|
| **Not configured** / **Unknown** / missing env message | Render (or local) env var not pasted | **William** in Render → Environment |
| **Config debt** panel + daily SYSTEM ticket (`dr-os-config-debt`) | Same — reminder only | **William** — Knights do **not** invent or set secrets |
| Connection **Relay OK** vs **Chef's Brain unset** | Split deliberately — unset Brain ≠ pilot offline | William pastes `ECHO_AI_*`; relay needs heartbeat + ingest secret |
| GitHub “token needs repo read” / 404 | `GITHUB_TOKEN` missing, wrong scope, or private-repo access | William PAT with **repo read** |
| Pilot **No pilot record** | Fixed in code — Miccosukee auto-upserts if missing | Code (deploy) |
| Crash / CI / deploy failure tickets | Exception flywheel → Knights + agent loop | Knights / computer_agent |

**Knights cannot open the Render dashboard or paste secrets.** Red “Not configured” panels are not bugs for the Round Table to invent keys.

---

## Panel → env checklist (turn each green)

Paste on **echoaurion-company-os** (Render) unless noted. Never commit values.

| Panel | Green when | Env vars (William pastes) |
|---|---|---|
| **GitHub Repos** | Commits load; age → Active/Stale/Inactive (Inactive = last commit &gt;30d, not a missing key) | `GITHUB_TOKEN` (PAT: `repo` or at least read for private; `public_repo` insufficient for private). Repos: `wmorrison76/EchoAurion-Company-OS`, `wmorrison76/Echo_Aurion-LUCCCA_Framework` |
| **Render Deploy** | Latest deploy status Live/Deploying/Failed | `RENDER_API_KEY` + `RENDER_SERVICE_ID` |
| **Neon DB** | Connected + ms | `DATABASE_URL` (already required for app boot) |
| **Stripe MRR** | Live MRR (even $0) | `STRIPE_SECRET_KEY` |
| **Active Users** | 30-day count | `PRODUCT_DATABASE_URL` (read-only product Neon) |
| **Pilot — Miccosukee** | Stage + health from DB | None after deploy — row auto-ensured |
| **Connection · Relay** | Secret set + recent heartbeat | `SUPPORT_INGEST_SECRET` (= luccca-web `COMPANY_OS_INGEST_SECRET`) + pilot sending heartbeats |
| **Connection · Chef's Brain** | Env + probe OK | `ECHO_AI_URL`=`https://luccca-web.onrender.com/api/company-os/echo-brain` · `ECHO_AI_KEY`=luccca-web `ECHO_BRAIN_SECRET` (or ingest secret) |
| **Config debt** | Empty list | Clear each row’s vars above |

See also [`CONNECT_PILOT_TO_COMPANY_OS.md`](./CONNECT_PILOT_TO_COMPANY_OS.md) · [`OPEN_OPS_CHECKLIST.md`](./OPEN_OPS_CHECKLIST.md).

---

## Code-done (no Render click required)

| Surface | Status |
|---|---|
| System Status tally (GitHub, Render, Neon, Stripe, users, pilot) | ✓ |
| **Config debt** panel + daily SYSTEM ticket (no Knights queue) | ✓ |
| Connection health: **relay vs Chef's Brain** split badges | ✓ |
| Miccosukee pilot auto-ensure if missing | ✓ |
| GitHub 401/403/404 → clear “token needs repo read” (not forever Unknown) | ✓ |
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

- `pilotConnection` (incl. `relayLevel` / `brainLevel`), `configDebt`, `drain`, `nightCleaner`, `helpEval`, `costAnomaly`
- `neon.poolSize`, `stripe.nextBillingTotal` / `nextBillingAt`

---

## William-when-well (secrets / crons only)

Do these in the Render dashboard when healthy. **No secrets in git. Knights cannot do this.**

1. **`CRON_SECRET`** on web **and each cron service** (see `docs/CRON_SECRET_SETUP.md`).
2. **Ops poll cron** — `echoaurion-company-os-ops-poll` → `POST /api/ops/poll-failures` (every ~5m). Without it, drain chip stays “never / stale”.
3. **HelpEval Friday cron** — Thu `0 22 * * 4` UTC → `POST /api/ops/help-eval-friday` with Bearer `CRON_SECRET`.
4. **Cost anomaly cron** — daily (after financial sync) → `POST /api/ops/cost-anomaly`.
5. **Night Cleaner** — pilot/night script → `POST /api/ops/night-cleaner-report` (Bearer `CRON_SECRET`). Until first ingest, chip shows “No night report yet”.
6. **`SUPPORT_INGEST_SECRET`** paired with luccca-web `COMPANY_OS_INGEST_SECRET` (byte-identical).
7. **Panel greens** — paste from the table above (`GITHUB_TOKEN`, `RENDER_*`, `STRIPE_SECRET_KEY`, `PRODUCT_DATABASE_URL`, `ECHO_AI_*`).
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
