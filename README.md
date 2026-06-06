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

