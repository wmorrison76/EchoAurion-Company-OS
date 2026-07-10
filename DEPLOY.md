# Deploy EchoAurion Company OS (Super Admin)

This repo is the **Aurion Holdings / EchoAurion control plane** — not the product.
Product code (`Echo_Aurion-LUCCCA_Framework`, EchoCoder) stays untouched. Clients
ask for help; the **Knights of the Round Table** draft answers and plans; **you**
approve free or charge before anything ships.

## What you get after deploy

| Surface | Purpose |
|---|---|
| `/dr-os` | Live system status (Render, Neon, Stripe, GitHub, pilots) |
| `/board-room` | Knights of the Round Table — multi-AI counsel |
| `/fleet-nexus` | Operational fleet map — Render services + Support health, blast radius |
| `/support` | Client health, Ask-the-Board questions, billable/free change requests |
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
| `ADMIN_EMAIL` | yes | Your login email |
| `ADMIN_PASSWORD_HASH` | yes | bcrypt hash (no escaping on Render). Bootstrap only — after Forgot Password reset, the live hash lives in DB (`admin_auth`) and is preferred over this env var |
| `CRON_SECRET` | yes | Guards cron POSTs (needed when you add crons) |
| `EMAIL_FROM` | for forgot-password | e.g. `noreply@aurion-holdings.com` or Resend’s `onboarding@resend.dev` while testing |
| `RESEND_API_KEY` | for forgot-password | Preferred mail provider. Without this (or SMTP_*), Forgot Password returns “Email is not configured” |

### Env vars (turn on Knights + Support)

| Variable | Purpose |
|---|---|
| `PERPLEXITY_API_KEY` | Maestro |
| `OPENAI_API_KEY` | Analyst |
| `ANTHROPIC_API_KEY` | Strategist + Architect |
| `GOOGLE_AI_API_KEY` | Scout |
| `ECHO_AI_URL` / `ECHO_AI_KEY` | Chef's Brain (optional) |
| `SUPPORT_INGEST_SECRET` | Product → `/api/support/*` and `/api/relay/*` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Phone push |
| `WORK_SENIOR_RATE` / `WORK_VALUE_MULTIPLIER` | Quote math (defaults 185 / 2.5) |

### Env vars (live panels)

`RENDER_API_KEY`, `RENDER_SERVICE_ID`, `GITHUB_TOKEN`, `STRIPE_*`, `PLAID_*`,
`MERCURY_API_KEY`, `PRODUCT_DATABASE_URL` (read-only product DB for active users).

**Fleet Nexus** (`/fleet-nexus`) uses `RENDER_API_KEY` to list **all** services in
the Render account (not only `RENDER_SERVICE_ID`) and merges Support client
health from the Company OS DB. Without the key, the page shows Empty / Unknown
(or a clearly labeled Demo graph in local `NODE_ENV=development` only — never
faked as live in production).

Unset integrations show as **Unknown** / unavailable — the app still boots.

### Forgot password (email)

1. Create a [Resend](https://resend.com) API key → set `RESEND_API_KEY` on Render.
2. Set `EMAIL_FROM` to a verified sender (or `onboarding@resend.dev` for first tests).
3. Ensure `NEXTAUTH_URL` is the public `https://…` URL so reset links are correct.
4. On `/login` → **Forgot password?** → enter `ADMIN_EMAIL` → open the link → set a new password (min 12 chars).
5. The new hash is written to Neon (`admin_auth`). **Do not** paste a hash into Render after reset — login uses the DB override when present.

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

## 4b. Cron jobs (optional follow-up — after web is live)

Blueprint crons were removed so first deploy is not blocked by YAML/validation
issues. Unquoted `curl … -H "Authorization: Bearer $CRON_SECRET"` is **invalid
YAML** (the colon after `Authorization` is parsed as a mapping). Node native
images also may not ship `curl`.

After the web service is healthy, add two **Cron Jobs** in the Render dashboard
(or a later Blueprint revision) with `runtime: node`:

| Name | Schedule (UTC) | Purpose |
|---|---|---|
| `echoaurion-company-os-sync` | `0 8 * * *` | `POST /api/financial/sync` |
| `echoaurion-company-os-briefing` | `0 11 * * *` | `POST /api/board-room/briefing` |

**Env vars on each cron:** `WEB_SERVICE_URL` = web service public URL,
`CRON_SECRET` = same value as the web service.

**Recommended `startCommand`** (single-quoted YAML / paste as one line; uses
Node 18+ `fetch`, no `curl`):

```bash
node -e 'fetch(process.env.WEB_SERVICE_URL+"/api/financial/sync",{method:"POST",headers:{Authorization:"Bearer "+process.env.CRON_SECRET}}).then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))'
```

For the briefing job, swap the path to `/api/board-room/briefing`.

`buildCommand` can be `true` (quoted string) if Render requires one.

## 5. Post-deploy smoke check

- [ ] `GET /api/health` → `{ "status": "ok", "database": "ok" }`
- [ ] Login with `ADMIN_EMAIL`
- [ ] `/fleet-nexus` loads (Live/Partial/Empty banner; graph when Render key set)
- [ ] `/board-room` shows Knights (Unavailable until keys set)
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
