# EchoAurion Company OS

Internal operating system for Aurion Holdings, Inc. (dba EchoAurion).

**This repo is separate from the product.** The hospitality platform lives at [Echo_Aurion-LUCCCA_Framework](https://github.com/wmorrison76/Echo_Aurion-LUCCCA_Framework).

## What This Builds

| Module | Purpose |
|---|---|
| Dr. OS Dashboard | Super-admin panel — all systems, Render, Neon, Stripe, GitHub, pilot status |
| AurionIndex | AWS CDK infrastructure scaffold (ECS, RDS, CloudFront, S3, Route 53) |
| Plaid Financial Monitor | Wells Fargo + Mercury — burn rate, bill calendar, runway calculator |
| CRM | Partnership, investor, and advisor pipeline |
| Revenue Dashboard | Stripe MRR, runway to Oct 1, investor raise tracker |

## For Claude Code

Read `CLAUDE.md` first. That is the complete build brief — 1,705 lines covering every module, design system, tech stack, environment variables, Prisma schema, build order, and acceptance criteria.

Start with Step 1 in §15 of CLAUDE.md.

## Build Status

| Step | Module | Status |
|---|---|---|
| 1 | Project scaffold + NextAuth auth | ✅ Complete |
| 2 | Dr. OS Dashboard (8 status panels) | ◻ Pending |
| 3 | Financial Monitor (Plaid + Mercury) | ◻ Pending |
| 4 | Revenue Dashboard (Stripe MRR) | ◻ Pending |
| 5 | CRM (Kanban + contacts) | ◻ Pending |
| 6 | AurionIndex CDK | ◻ Pending |

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

npm run dev          # http://localhost:3000 → redirects to /dr-os → /login
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

