# Deploy EchoAurion Company OS (Super Admin)

This repo is the **Aurion Holdings / EchoAurion control plane** — not the product.
Product code (`Echo_Aurion-LUCCCA_Framework`, EchoCoder) stays untouched. Clients
ask for help; the **Knights of the Round Table** draft answers and plans; **you**
approve free or charge before anything ships.

## What you get after deploy

| Surface | Purpose |
|---|---|
| `/` | Public Aurion Holdings marketing homepage → Login → Dr. OS |
| `/dr-os` | Live system status (Render, Neon, Stripe, GitHub, pilots) |
| `/board-room` | Knights of the Round Table — multi-AI counsel |
| `/fleet-nexus` | Operational fleet map — Render services + Support health, blast radius |
| `/knowledge-plane` | Aurion Knowledge Plane — anonymized learning (no guest PII) |
| `/support` | Client health, Ask-the-Board questions, billable/free change requests |
| `/support/inbox` | Unified triage queue (questions + work · Approve free / Quote) |
| `/financial` · `/crm` · `/revenue` | Money, pipeline, MRR |
| `/aurion-index` | AWS infra panel (CDK scaffold; deploy later) |

### Approval gate (do not skip)

```
Customer / product → Support or Relay API
        ↓
Knights draft answer or implementation plan (sandbox)
        ↓
YOU decide: Approve free  |  Send quote (charge)  |  Decline
        ↓ (if charge)
Billing contact authorizes spend
        ↓
YOU Execute (rollback reference required)
```

Nothing auto-fixes the product. EchoCoder / product agents only act after your
approval path completes (and product wiring is a later step).

**Free vs Charge matrix + 10-minute answer rule:** [SUPPORT_POLICY.md](./SUPPORT_POLICY.md).
The Support console shows the same guidance as chips on each question/request.

## Prerequisites

1. **Neon** Postgres project dedicated to Company OS (not the product DB).
2. **Render** account (or any Node host that can run `next start`).
3. Admin email + bcrypt password hash.
4. Optional but recommended: Knight API keys, `SUPPORT_INGEST_SECRET`, VAPID keys.

## 1. Create Neon database

- Create a new project (e.g. `echoaurion-company-os`).
- Copy **pooled** URL → `DATABASE_URL`
- Copy **direct** URL → `DATABASE_URL_UNPOOLED`

**Region note:** Neon in `us-east-1` with Render in Oregon (or any other region) is
fine for v1. Cross-region latency is not a deploy blocker. Same-region is optional
later if you want to shave a few ms off DB round-trips.

**Connection limit:** Neon shows `connection_limit` in project settings (often
**100** on paid tiers, lower on free). Prisma opens a small pool **per process**
— size it explicitly on the pooled URL:

```text
postgresql://…/neondb?pgbouncer=true&connection_limit=10
```

| Process | Typical pool | Notes |
|---|---|---|
| Web (Standard, 1 instance) | **10** | Dr. OS reads `connection_limit` for the Neon panel |
| Each cron | **1–2** | Short-lived; bursts during migrate deploy |
| Horizontal web (2+ replicas) | **≤8 each** | Requires Upstash for rate limits + relay SSE — see `docs/SCALE_AND_THROTTLE.md` |

**Rule:** `(web_instances × pool) + active_crons ≤ Neon limit − 2`. Knight queue
keeps LLM work off the web hot path so connections are not held for minutes.

**Prisma:** App uses the default client in `src/lib/db.ts` — no per-request
clients. Migrations use `DATABASE_URL_UNPOOLED` via `schema.prisma` `directUrl`.
Never raise `connection_limit` without checking Neon dashboard headroom.

**Build note:** `render.yaml` uses `npm install --include=dev` so Next can compile
even when Render sets `NODE_ENV=production` during install (otherwise `tailwindcss`
and other build-time packages are skipped).

## 2. Generate secrets

```bash
# Session secret
openssl rand -base64 32

# Admin password hash (escape $ as \$ in .env.local only)
node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD', 10))"

# Cron + support ingest
openssl rand -hex 32

# Web push (phone alerts)
npx web-push generate-vapid-keys
```

## 3. Render Blueprint

This repo includes `render.yaml` with the **web service only**
(`echoaurion-company-os`). Cron jobs are intentionally omitted from the
Blueprint so the first deploy validates cleanly — add them after the web
service is live (see **Cron jobs** below).

### Env vars (minimum to boot)

| Variable | Required | Notes |
|---|---|---|
| `NEXTAUTH_SECRET` | yes | From step 2 |
| `NEXTAUTH_URL` | yes | Full public `https://…` URL (paste after first deploy if needed) |
| `AUTH_TRUST_HOST` | yes | `true` |
| `DATABASE_URL` | yes | Neon pooled |
| `DATABASE_URL_UNPOOLED` | yes | Neon direct |
| `ADMIN_EMAIL` | yes | Canonical Super Admin: `william@echoaurion.com` |
| `ADMIN_PASSWORD_HASH` | yes | bcrypt hash (no escaping on Render). Bootstrap only — after Forgot Password reset, the live hash lives in DB (`admin_auth`) and is preferred over this env var |
| `CRON_SECRET` | yes | Guards cron POSTs (needed when you add crons) |
| `EMAIL_FROM` | for forgot-password | Test: `onboarding@resend.dev`. Prod: verified domain sender. See **Forgot password** below |
| `RESEND_API_KEY` | for forgot-password | Required for mail. Without it (or SMTP_*), form shows “Email is not configured”. Health: `emailConfigured` |

### Env vars (turn on Knights + Support + Elite)

| Variable | Purpose |
|---|---|
| `PERPLEXITY_API_KEY` | Maestro |
| `OPENAI_API_KEY` | Analyst |
| `ANTHROPIC_API_KEY` | Strategist + Architect |
| `GOOGLE_AI_API_KEY` | Scout (preferred). Also accepts `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` |
| `ECHO_AI_URL` / `ECHO_AI_KEY` | Chef's Brain — **exact URL:** `https://luccca-web.onrender.com/api/company-os/echo-brain`; KEY = luccca-web `ECHO_BRAIN_SECRET` (or ingest secret). Clears Connection health reds. See `docs/CONNECT_PILOT_TO_COMPANY_OS.md` |
| `FIX_DIGEST_HOURS` / `FIX_DIGEST_TO` | Optional — 4h fix digest cron (`echoaurion-company-os-fix-digest`). Defaults: `4` / `ADMIN_EMAIL`. Needs `EMAIL_FROM` + Resend/SMTP |
| `ECHO_PANEL_WATCH` | `on` (default) — set `off` to kill Echo silent panel-watch tickets |
| `ECHO_TICKETS_PER_CLIENT_PER_HOUR` | Max Echo→Help Desk tickets per property/hour (default `8`) |
| `ECHO_ONCALL_MINUTES` / `ECHO_ONCALL_TO` | Unresolved Echo TECH → email William (cron `echoaurion-company-os-echo-oncall`, every 10m). Defaults: `30` / `FIX_DIGEST_TO` or `ADMIN_EMAIL` |
| `SUPPORT_INGEST_SECRET` | Product → `/api/support/diagnostics` and `/api/relay/*` (whoami, heartbeat, stream, questions, work) |
| `AUTO_KNIGHTS_ON_QUESTION` | Default `true` — inbound relay questions auto-run Knights + HelpTicket TEXT |
| `ECHO_AUTO_APPROVE` | Default `true` when unset — Echo AI–captured tickets auto-approve & send after Knights + always `echo_repair_ready`. Set `false` for production dual-control. Alias: `HELP_DESK_ECHO_AUTO_APPROVE`. Never auto BUILD / payroll disclose / core merge (code-change → auto-ack Echo only) |
| `HELP_DESK_AUTO_APPROVE` | Default `true` when unset (testing) — all Help Desk TEXT tickets auto Approve & send after Knights (not Echo-only). Set `false` for dual-control. Bulk clear: `POST /api/ops/approve-all-awaiting`. BUILD/BILLING/core merge stay locked |
| `KNOWLEDGE_INGEST_SECRET` | Echo AI³ → `POST /api/knowledge/ingest` (falls back to SUPPORT_INGEST_SECRET) |
| `KNIGHTS_STANDBY_MODE` | Legacy: `off` \| `draft_only` \| `auto_answer_low_risk`. Elite dial also accepted: `assist` \| `standby` \| `autopilot` |
| `AUTONOMY_DIAL` | Preferred elite dial when DB unset (`assist` default intent) |
| `STANDBY_MAX_AUTO_PER_HOUR` | Cap on standby auto-answers per hour (default `10`) |
| `BUILD_SPEND_CAP_USD` | Per-client monthly quote cap (default `5000`) — warn/block on `/api/work/:id/quote` |
| `GITHUB_BUILD_REPO` / `GITHUB_BUILD_BASE` | Optional Architect draft-PR target (see `docs/PR_FROM_BUILD.md`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Phone push |
| `WORK_SENIOR_RATE` / `WORK_VALUE_MULTIPLIER` | Quote math (defaults 185 / 2.5) |

**Elite Help Desk:** `/lab/elite` checklist, `/lab/echo-chrome`, constitution, safe tools, eval — see `docs/ELITE_DR_OS.md`.

**Pilot Connection Hub:** see `docs/PILOT_CONNECTION.md` and `docs/CONNECT_PILOT_TO_COMPANY_OS.md` for SSE contract, heartbeat, shared secret, and Chef's Brain URL.  
After deploy, set `SUPPORT_INGEST_SECRET` on Render before any pilot connects.

**Scout note:** If you set `GEMINI_API_KEY` on Render but not `GOOGLE_AI_API_KEY`,
that is fine after this deploy — both names are accepted. Prefer
`GOOGLE_AI_API_KEY`. Scout model is `gemini-2.0-flash` (Generative Language API).
Restart the web service after changing env vars, then hard-refresh Board Room.
### Env vars (live panels)

`RENDER_API_KEY`, `RENDER_SERVICE_ID`, `GITHUB_TOKEN`, `STRIPE_*`, `PLAID_*`,
`MERCURY_API_KEY`, `PRODUCT_DATABASE_URL` (read-only product DB for active users).

**Fleet Nexus** (`/fleet-nexus`) uses `RENDER_API_KEY` to list **all** services in
the Render account (not only `RENDER_SERVICE_ID`) and merges Support client
health from the Company OS DB. Without the key, the page shows Empty / Unknown
(or a clearly labeled Demo graph in local `NODE_ENV=development` only — never
faked as live in production).

Unset integrations show as **Not configured** / Unknown — the app still boots.
These are **env pastes for William** (see `docs/DR_OS_COMPLETE.md` Panel → env checklist),
not exception-flywheel work for Knights.

### Upstash Redis (optional — not required to deploy)

| Variable | Required | Notes |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | no | Upstash **Redis** REST URL (`https://…upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | no | REST token from same Upstash database |

**Deploy works without these.** When unset, rate limits and relay SSE use in-memory
per-instance fallbacks. Wire Upstash on **echoaurion-company-os web only** (crons
do not need Redis) before scaling to 2+ web instances.

Step-by-step (ELI5): **`docs/UPSTASH_SETUP.md`**. Verify after paste:

```bash
curl -sS https://echoaurion-company-os.onrender.com/api/health
# "redisFanout": "configured" when wired; "memory-only" when unset (both OK)
```

### Render plan (do not downgrade)

`render.yaml` sets **`plan: pro`**. Next.js production builds often OOM on Standard
(512MB). If you manually upgraded to Pro in the dashboard, Blueprint sync must not
force `plan: standard` — that was the likely cause of the `c34d930` deploy failure.

### Forgot password (email) — Resend setup (get mail today)

**Root cause of “success but no email”:** if `RESEND_API_KEY` / `EMAIL_FROM` are
missing, the API returns `EMAIL_NOT_CONFIGURED` (503) and the form shows an error.
If keys are set but Resend rejects the send (free-tier recipient rules), the API
returns `EMAIL_SEND_FAILED` (502). Wrong email still shows the generic success
message (anti-enumeration).

Check live config without secrets:

```bash
curl -sS https://echoaurion-company-os.onrender.com/api/health
# expect: "emailConfigured": true
```

#### Steps (testing with Resend free tier — fastest)

1. Create an account at [resend.com](https://resend.com) **using the same inbox as `ADMIN_EMAIL`** (e.g. William’s Gmail).
2. **API Keys** → Create → copy the key → Render → Environment → `RESEND_API_KEY` = that value.
3. Set `EMAIL_FROM` = `onboarding@resend.dev` (Resend’s shared test sender).
4. Confirm `ADMIN_EMAIL` on Render is **exactly** the email on the Resend account (same inbox). With `onboarding@resend.dev`, Resend **only delivers to that verified account email** until you verify a custom domain.
5. Confirm `NEXTAUTH_URL` = `https://echoaurion-company-os.onrender.com` (no trailing slash) so the reset link is correct.
6. **Save** env vars → **Manual Deploy** (or wait for auto-deploy) so the new keys load.
7. Open `/login` → **Forgot password?** → enter `ADMIN_EMAIL` exactly → check that inbox (and spam).
8. Open the link → set a new password (min 12 chars). The hash is written to Neon (`admin_auth`). **Do not** paste a new hash into Render after reset.

#### Production sender (optional, after testing)

1. In Resend → **Domains** → add `aurion-holdings.com` (or your sending domain) → add the DNS records Resend shows.
2. After the domain is **Verified**, set `EMAIL_FROM` to e.g. `noreply@aurion-holdings.com`.
3. You can then send to any `ADMIN_EMAIL`, not only the Resend signup inbox.

#### Render env checklist (forgot-password)

| Variable | Required | Example / note |
|---|---|---|
| `RESEND_API_KEY` | yes (or SMTP_*) | `re_…` from Resend |
| `EMAIL_FROM` | yes | `onboarding@resend.dev` (test) or `noreply@your-verified-domain` |
| `ADMIN_EMAIL` | yes | Must match Resend account email when using `onboarding@resend.dev` |
| `NEXTAUTH_URL` | yes | Public `https://echoaurion-company-os.onrender.com` |
| `ADMIN_PASSWORD_HASH` | bootstrap | Ignored for login once DB override exists after reset |

SMTP alternative: leave `RESEND_API_KEY` empty and set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, optional `SMTP_PORT` / `SMTP_SECURE`, plus `EMAIL_FROM`.

## 4. Deploy steps

1. Push `claude/vigilant-rubin-DtQE3` (or merge to the branch Render watches).
2. In Render: **New → Blueprint** → select this repo → apply `render.yaml`.
3. Paste env vars from the tables above. For `NEXTAUTH_URL`, use the service’s
   public `https://…` URL (shown on the service page after create).
4. First deploy runs `prisma migrate deploy` on start (initial migration included).
5. Open the service URL → `/login` → land on `/dr-os`.
6. Optional: `npm run prisma:seed` once against production (bills, CRM seed) via
   a one-off shell, or run locally pointed at Neon.

## 4b. Cron jobs (in `render.yaml`)

Blueprint includes optional cron services that run small Node scripts under
`scripts/cron-*.mjs` (clear stdout errors; no nested `node -e` quotes).
`buildCommand` is `true` (repo checkout only — no npm install needed).

| Name | Schedule (UTC) | Start command |
|---|---|---|
| `echoaurion-company-os-sync` | `0 8 * * *` | `node scripts/cron-financial-sync.mjs` |
| `echoaurion-company-os-briefing` | `0 11 * * *` | `node scripts/cron-briefing.mjs` |
| `echoaurion-company-os-maintenance` | `0 * * * *` | `node scripts/cron-maintenance-dispatch.mjs` |
| `echoaurion-company-os-fix-digest` | `0 */4 * * *` | `node scripts/cron-http-post.mjs /api/ops/fix-digest` |

**Fix digest:** emails William a summary of Help Desk resolves, SYSTEM fixes, `echo_repair_ready`, and approved sends. Set `CRON_SECRET` on the cron; email uses web `RESEND_API_KEY` + `EMAIL_FROM`. If email is unset, the route logs a skip and still returns 200.

**Env on each cron (required):**

| Key | How to set |
|---|---|
| `WEB_SERVICE_URL` | Blueprint: `fromService` → web `RENDER_EXTERNAL_URL`. Or Manual Sync to `https://echoaurion-company-os.onrender.com` (no trailing slash). |
| `CRON_SECRET` | Same value as the **web** service (`sync: false`). Set on web + every cron, then Manual Sync blueprint. Full clicks: [docs/CRON_SECRET_SETUP.md](./docs/CRON_SECRET_SETUP.md). |

Scripts also fall back to `RENDER_EXTERNAL_URL` / `NEXTAUTH_URL` if `WEB_SERVICE_URL` is missing.
Exit 0 on HTTP 2xx (including empty dispatch `{ sent: [] }`). Exit 1 on missing env, auth fail, redirect/middleware, or 5xx.

**Maintenance notices:** compose at `/maintenance`. Send now or schedule; hourly cron
fires due `SCHEDULED` rows. Manual:

```bash
curl -X POST "$WEB_SERVICE_URL/api/maintenance/dispatch" \
  -H "Authorization: Bearer $CRON_SECRET"
```

If Blueprint cron create fails, add the same jobs manually with startCommand
`node scripts/cron-maintenance-dispatch.mjs` (or the sync/briefing script).
`buildCommand` can be `true`.

## 4c. Knowledge Plane

See [docs/AURION_KNOWLEDGE_PLANE.md](./docs/AURION_KNOWLEDGE_PLANE.md) and
[docs/RELAY_CONTRACTS.md](./docs/RELAY_CONTRACTS.md).

- Admin UI: `/knowledge-plane`
- Ingest: `POST /api/knowledge/ingest` with `Authorization: Bearer $KNOWLEDGE_INGEST_SECRET`
- Privacy: no guest PII; PII-like keys are rejected at ingest

## 5. Post-deploy smoke check

- [ ] `GET /` → public Aurion homepage (Login → `/login` → Dr. OS)
- [ ] `GET /api/health` → `{ "status": "ok", "database": "ok" }`
- [ ] Login with `ADMIN_EMAIL`
- [ ] `/fleet-nexus` loads (Live/Partial/Empty banner; graph when Render key set)
- [ ] `/knowledge-plane` shows privacy banner + empty signals/insights
- [ ] `/support/inbox` loads unified queue
- [ ] `/maintenance` loads compose + notice history
- [ ] `/board-room` shows Knights (Unavailable until keys set) + Board → Support
- [ ] `/support` loads Questions + Change Requests + Alerts
- [ ] Approve free / Send quote / Decline buttons visible on a work card
- [ ] Phone: Add to Home Screen → enable Notify (needs VAPID)

## 6. Product connection (later — not this deploy)

When you are ready to wire EchoAurion / EchoCoder (without changing product yet
beyond a thin client):

- Product posts diagnostics with `Authorization: Bearer $SUPPORT_INGEST_SECRET`
  to `POST /api/support/diagnostics`
- Ask-the-Board: `POST /api/relay/questions`, pull answers via
  `GET /api/relay/questions/pull`
- Change requests: `POST /api/relay/work`, customer authorize
  `POST /api/relay/work/:id/authorize`, pull results
  `GET /api/relay/work/pull`
- Knowledge telemetry: `POST /api/knowledge/ingest` (allowlisted schemas only)

Until that client exists, you can still operate Company OS as the admin console
and exercise Board Room + Support manually.

## Local dry-run

```bash
cp .env.example .env.local
# fill DATABASE_*, NEXTAUTH_*, ADMIN_*
npm install
npx prisma migrate deploy
npm run prisma:seed   # optional
npm run build
npm start
```
