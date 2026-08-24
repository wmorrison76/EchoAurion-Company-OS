# EchoAurion Company OS

**Super-admin control plane** for Aurion Holdings, Inc. (dba EchoAurion) — monitor
every client, route tech support through the **Knights of the Round Table**, and
approve work **free or charged** before anything ships.

**This repo is separate from the product.** The hospitality platform /
EchoCoder live at [Echo_Aurion-LUCCCA_Framework](https://github.com/wmorrison76/Echo_Aurion-LUCCCA_Framework).
Do not import from or modify the product from here.

**Deploy guide:** see [DEPLOY.md](./DEPLOY.md).  
**Support Free vs Charge:** see [SUPPORT_POLICY.md](./SUPPORT_POLICY.md) (10-minute answer rule + matrix).  
**Help Desk:** see [docs/HELP_DESK.md](./docs/HELP_DESK.md) (tickets · voice dictation · Knights · planning gaps).

## What This Builds

| Module | Purpose |
|---|---|
| Public homepage (`/`) | Aurion Holdings marketing → Operator Login → Dr. OS |
| Dr. OS Dashboard | Super-admin panel — all systems, Render, Neon, Stripe, GitHub, pilot status |
| Board Room | Knights counsel (strategy) — multi-AI orchestration (draft only) |
| Fleet Nexus | Operational map — Render services + Support client health, blast-radius triage |
| Knowledge Plane | Aurion Knowledge Plane / Echo Resonance Network — anonymized learning (no guest PII) |
| Support | Client health · diagnostics · free/charge gate ([policy](./SUPPORT_POLICY.md)) |
| Support Inbox | Unified triage queue → deep-links into Help Desk |
| Help Desk | Live tickets — text · voice dictation · Ask Knights · custom builds ([guide](./docs/HELP_DESK.md)) |
| AurionIndex | AWS CDK infrastructure scaffold (ECS, RDS, CloudFront, S3, Route 53) |
| Plaid Financial Monitor | Wells Fargo + Mercury — burn rate, bill calendar, runway calculator |
| CRM | Partnership, investor, and advisor pipeline |
| Revenue Dashboard | Stripe MRR, runway, investor raise tracker |

**Vision docs:** [docs/AURION_KNOWLEDGE_PLANE.md](./docs/AURION_KNOWLEDGE_PLANE.md) · [docs/RELAY_CONTRACTS.md](./docs/RELAY_CONTRACTS.md)

## For Claude Code

Read `CLAUDE.md` first. That is the complete build brief — 1,705 lines covering every module, design system, tech stack, environment variables, Prisma schema, build order, and acceptance criteria.

Start with Step 1 in §15 of CLAUDE.md.

## Build Status

| Step | Module | Status |
|---|---|---|
| 1 | Project scaffold + NextAuth auth | ✅ Complete |
| 2 | Dr. OS Dashboard (8 status panels) | ✅ Complete |
| 3 | Financial Monitor (Plaid + Mercury) | ✅ Complete |
| 4 | Revenue Dashboard (Stripe MRR) | ✅ Complete |
| 5 | CRM (Kanban + contacts) | ✅ Complete |
| 6 | AurionIndex CDK | ◻ Scaffold — static checklist, not live AWS |
| 7 | Board Room (Knights) | ✅ Complete |
| 8 | Support + Ask-the-Board + free/charge gate | ✅ Complete (tickets live in Help Desk) |
| 9 | PWA + push alerts | ✅ Complete |
| 10 | Fleet Nexus (Render + Support ops map) | ✅ Complete |
| 11 | Public homepage + Knowledge Plane | ◻ Partial — keyword retrieve; embeddings deferred |
| 12 | Help Desk (tickets · Knights · dictation) | ✅ Ops-complete · phone IVR = scaffold (not live) |
| — | Production deploy (Render + Neon) | ◻ See DEPLOY.md |

**Honesty (do not over-claim):** single-admin login only — no invites, roles, or multi-seat. Phone IVR is a scaffold (no live Twilio number). AurionIndex is a pre-migration checklist, not CloudWatch. Knowledge retrieve is keyword-only (`embeddingsEnabled: false`). Autopilot / Approve = chat, not a product deploy.

## Local Development

```bash
git clone https://github.com/wmorrison76/EchoAurion-Company-OS
cd EchoAurion-Company-OS
npm install

# Configure environment
cp .env.example .env.local
#   - NEXTAUTH_SECRET / AUTH_SECRET: openssl rand -base64 32
#   - ADMIN_EMAIL:        your admin email
#   - ADMIN_PASSWORD_HASH: bcrypt hash of your password (see note below)
#   - DATABASE_URL / DATABASE_URL_UNPOOLED: Neon connection strings

# Database (requires a reachable Postgres / Neon project)
npx prisma migrate dev

npm run dev          # http://localhost:3000 → public homepage; /login → Dr. OS
```

Generate an admin password hash:

```bash
node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"
```

> **Env gotcha (local only):** bcrypt hashes contain `$`, which `@next/env`
> tries to expand inside `.env.local`. Escape each `$` with a backslash so the
> value is read literally:
> `ADMIN_PASSWORD_HASH=\$2a\$10\$...`. On Render, env vars are real process
> variables and need no escaping.

## Available Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Run the production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run prisma:migrate` | Apply migrations (dev) |
| `npm run prisma:seed` | Seed the database |

## Deployment (Render)

The app deploys as a Render web service. Build: `npm install && npx prisma
generate && npm run build`. Start: `npx prisma migrate deploy && npm start`.
Set every variable from `.env.example` in the Render dashboard, plus
`NEXTAUTH_URL` = the service URL. Health check path: `/api/health`.

> **Do not deploy to production until all §23 acceptance criteria pass.**

## Stack

- Next.js 14 App Router + TypeScript (strict)
- Neon PostgreSQL + Prisma
- Tailwind CSS
- NextAuth v5
- Plaid API + Mercury API + Stripe API
- AWS CDK (TypeScript) for AurionIndex

## Design Standard

V&A Standard — every screen measured against Forbes 5-Star / AAA 5-Diamond quality bar.
Dark background (#0a0a0f), gold accent (#D4AF37).
All status indicators use shape + label + number (colorblind-safe).

