# CLAUDE.md — EchoAurion Company OS
## Claude Code Build Handoff Document

**Repo:** `https://github.com/wmorrison76/EchoAurion-Company-OS`  
**Model:** Claude Code (Opus 4.8)  
**Owner:** William Morrison, Founder — Aurion Holdings, Inc. (dba EchoAurion)  
**Last updated:** 2025  

---

## 0. Purpose of This Document

This file is the single authoritative build brief for Claude Code. Read it completely before writing a single line of code. Every architectural decision, naming convention, design rule, and acceptance criterion is recorded here. Do not infer, do not guess, do not introduce patterns not described here. If something is ambiguous, choose the most conservative option and note it in a `// TODO(claude):` comment.

---

## 1. Company & Product Context

| Field | Value |
|---|---|
| Legal entity | Aurion Holdings, Inc. |
| dba | EchoAurion |
| Incorporation | Delaware C-Corp via Stripe Atlas |
| Founder | William Morrison |
| Location | Fort Lauderdale, FL |
| Product | EchoAurion hospitality platform |
| Product URL | https://echoaurion.com |
| Product repo | https://github.com/wmorrison76/Echo_Aurion-LUCCCA_Framework |
| Product stack | TypeScript, Next.js, Neon PostgreSQL, Render, Cloudflare DNS |

This **Company OS** repository is completely separate from the product repository. It powers the internal business: admin visibility, financial monitoring, investor/partner CRM, and AWS infrastructure scaffolding. It must never import from or depend on the product repo.

---

## 2. What This Repo Is

`EchoAurion-Company-OS` is an internal business operating system — a single Next.js application with five integrated modules:

| Module | Route | Priority | Description |
|---|---|---|---|
| Dr. OS | `/dr-os` | 1 | Super admin dashboard |
| AurionIndex | `/aurion-index` | 2 | AWS infrastructure panel |
| Financial Monitor | `/financial` | 3 | Plaid + Mercury integration |
| CRM | `/crm` | 4 | Partnership & investor pipeline |
| Revenue Dashboard | `/revenue` | 5 | Stripe MRR + runway |

Root `/` redirects to `/dr-os`.

---

## 3. Absolute Rules (Never Violate)

1. **No hardcoded secrets.** Every credential lives in `.env.local`. Never commit actual values.
2. **No mock data in production.** All panels pull from real APIs (Stripe, Plaid, Neon, Render, GitHub). Use `NODE_ENV === 'development'` to enable seed/fixture data for local dev only.
3. **No placeholders.** Every screen must be fully functional. No "Coming Soon", no greyed-out panels that do nothing.
4. **Colorblind-safe UI.** William Morrison is colorblind. Every status indicator must use shape + label + number, never color alone. A green dot is unacceptable without an accompanying text label ("Healthy") and/or count.
5. **TypeScript strict mode.** `"strict": true` in `tsconfig.json`. No `any` casts except in explicitly marked escape hatches.
6. **Mobile-first.** William reviews on iPhone. Every layout must be fully functional at 390px width.
7. **Accessibility baseline.** All interactive elements must have `aria-label`. All status icons must have `aria-label` or a visible text alternative.
8. **Actor audit trail.** Every mutating action records `actor: "william_morrison" | "computer_agent"`, timestamp, action type, and a diff/payload snapshot to the `audit_log` table.

---

## 4. Design System

### 4.1 Colors

```css
/* Background */
--bg-base: #0a0a0f;
--bg-card: #12121a;
--bg-panel: #1a1a26;
--bg-hover: #22223a;

/* Accent */
--gold: #D4AF37;
--gold-muted: #9c7f1e;
--gold-bright: #f0c840;

/* Text */
--text-primary: #ffffff;
--text-secondary: #a0a0b8;
--text-muted: #5a5a78;

/* Status (always paired with label+shape) */
--status-ok: #22c55e;       /* green — always label: "Healthy" */
--status-warn: #f59e0b;     /* amber — always label: "Warning" */
--status-error: #ef4444;    /* red — always label: "Error" */
--status-unknown: #6b7280;  /* gray — always label: "Unknown" */

/* Border */
--border-subtle: #2a2a3f;
--border-accent: #D4AF37;
```

### 4.2 Typography

- **Font:** Inter (Google Fonts) — load via `next/font/google`
- **Headings:** `font-semibold`, tracking-tight
- **Body:** `font-normal`, `text-sm` (14px) as baseline
- **Mono (metrics/numbers):** `font-mono`, `tabular-nums`
- **Gold accent headings** (`text-[#D4AF37]`) for module names and KPI labels

### 4.3 Component Conventions

```
KPI Card:     bg-[#12121a] border border-[#2a2a3f] rounded-xl p-6
              Title: text-[#D4AF37] text-xs uppercase tracking-widest
              Value: text-white text-3xl font-mono font-semibold tabular-nums
              Sub:   text-[#a0a0b8] text-xs

Status Badge: rounded-full px-3 py-1 text-xs font-medium
              Always includes: icon (shape) + text label
              Example: ✓ Healthy | ⚠ Warning | ✕ Error | ? Unknown

Table:        Striped rows bg-[#12121a] / bg-[#0a0a0f]
              Header: text-[#D4AF37] text-xs uppercase tracking-widest
              No horizontal scroll on mobile — use card/accordion view below 640px

Sidebar:      Fixed left, 240px wide on desktop, collapsible on mobile
              Active route: border-l-2 border-[#D4AF37] bg-[#1a1a26]
```

### 4.4 Motion Policy

No gratuitous animations. Permitted:
- `transition-colors duration-150` on hover states
- `transition-opacity duration-200` on panel loads
- Skeleton loading shimmer during API fetches (use `animate-pulse`)

No page transitions, no slide-ins, no bounce effects.

### 4.5 V&A Standard

Every screen must feel like it belongs in a Forbes Five-Star property. Meaning:
- Information density is high but never cluttered
- Whitespace is intentional
- No rounded corners larger than `rounded-xl`
- No gradients except the subtle `bg-gradient-to-b from-[#12121a] to-[#0a0a0f]` on cards
- Borders are subtle (`#2a2a3f`), accent borders are gold only when meaningful

---

## 5. Technical Architecture

### 5.1 Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 App Router | Established product stack |
| Language | TypeScript 5.x (strict) | Type safety across all modules |
| Styling | Tailwind CSS 3.x | Consistent with product |
| Database | Neon PostgreSQL (separate project) | Isolation from product DB |
| ORM | Prisma 5.x | Type-safe DB access |
| Auth | NextAuth.js v5 (Auth.js) | JWT sessions, single admin |
| API client | Built-in `fetch` + custom wrappers in `src/lib/` | No Axios |
| Real-time | Server-Sent Events (SSE) for status panels | No WebSockets initially |
| State | React built-in + `swr` for data fetching | No Redux/Zustand |
| Testing | Vitest + React Testing Library | Unit + integration |
| Linting | ESLint + Prettier | Standard config |

### 5.2 Next.js Configuration

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
}

export default nextConfig
```

### 5.3 TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### 5.4 Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: { DEFAULT: '#D4AF37', muted: '#9c7f1e', bright: '#f0c840' },
        bg: { base: '#0a0a0f', card: '#12121a', panel: '#1a1a26', hover: '#22223a' },
        border: { subtle: '#2a2a3f', accent: '#D4AF37' },
      },
      fontFamily: { sans: ['var(--font-inter)', 'sans-serif'] },
    },
  },
  plugins: [],
}

export default config
```

---

## 6. Full File Structure

```
EchoAurion-Company-OS/
├── CLAUDE.md                          ← this file
├── README.md
├── .env.local                         ← local secrets (gitignored)
├── .env.example                       ← template, committed
├── .gitignore
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── prisma/
│   └── schema.prisma
├── infrastructure/                    ← AurionIndex AWS CDK
│   ├── bin/
│   │   └── aurion-index.ts
│   ├── lib/
│   │   ├── aurion-index-stack.ts
│   │   ├── constructs/
│   │   │   ├── ecs-fargate.ts
│   │   │   ├── rds-postgres.ts
│   │   │   ├── cloudfront.ts
│   │   │   ├── s3-buckets.ts
│   │   │   ├── route53.ts
│   │   │   └── vpc.ts
│   │   └── config.ts
│   ├── cdk.json
│   ├── package.json
│   └── tsconfig.json
└── src/
    ├── app/
    │   ├── layout.tsx                 ← root layout, Inter font, dark bg
    │   ├── page.tsx                   ← redirect → /dr-os
    │   ├── api/
    │   │   ├── auth/[...nextauth]/
    │   │   │   └── route.ts
    │   │   ├── dr-os/
    │   │   │   ├── status/route.ts    ← SSE stream for live status
    │   │   │   └── audit/route.ts
    │   │   ├── financial/
    │   │   │   ├── balances/route.ts
    │   │   │   ├── transactions/route.ts
    │   │   │   ├── bills/route.ts
    │   │   │   ├── burn-rate/route.ts
    │   │   │   └── plaid-link/route.ts
    │   │   ├── crm/
    │   │   │   ├── contacts/route.ts
    │   │   │   ├── deals/route.ts
    │   │   │   └── outreach/route.ts
    │   │   ├── revenue/
    │   │   │   ├── mrr/route.ts
    │   │   │   └── runway/route.ts
    │   │   └── aurora-index/
    │   │       └── status/route.ts
    │   ├── dr-os/
    │   │   ├── page.tsx
    │   │   └── loading.tsx
    │   ├── aurion-index/
    │   │   ├── page.tsx
    │   │   └── loading.tsx
    │   ├── financial/
    │   │   ├── page.tsx
    │   │   └── loading.tsx
    │   ├── crm/
    │   │   ├── page.tsx
    │   │   ├── [id]/
    │   │   │   └── page.tsx
    │   │   └── loading.tsx
    │   └── revenue/
    │       ├── page.tsx
    │       └── loading.tsx
    ├── components/
    │   ├── layout/
    │   │   ├── Sidebar.tsx
    │   │   ├── TopBar.tsx
    │   │   └── AppShell.tsx
    │   ├── ui/
    │   │   ├── KPICard.tsx
    │   │   ├── StatusBadge.tsx
    │   │   ├── DataTable.tsx
    │   │   ├── SkeletonCard.tsx
    │   │   ├── ProgressBar.tsx
    │   │   ├── RunwayGauge.tsx
    │   │   └── AuditLogRow.tsx
    │   ├── dr-os/
    │   │   ├── SystemStatusPanel.tsx
    │   │   ├── GitHubHealthPanel.tsx
    │   │   ├── RenderDeployPanel.tsx
    │   │   ├── NeonDBPanel.tsx
    │   │   ├── StripeMRRPanel.tsx
    │   │   ├── ActiveUsersPanel.tsx
    │   │   ├── PilotStatusPanel.tsx
    │   │   └── AuditTrailPanel.tsx
    │   ├── financial/
    │   │   ├── BalanceCards.tsx
    │   │   ├── BurnRateChart.tsx
    │   │   ├── BillCalendar.tsx
    │   │   ├── RunwayCountdown.tsx
    │   │   └── PLSummary.tsx
    │   ├── crm/
    │   │   ├── KanbanBoard.tsx
    │   │   ├── KanbanColumn.tsx
    │   │   ├── ContactCard.tsx
    │   │   ├── DealForm.tsx
    │   │   └── OutreachTimeline.tsx
    │   └── revenue/
    │       ├── MRRChart.tsx
    │       ├── RunwayCalculator.tsx
    │       ├── SalaryTargetBar.tsx
    │       └── RaiseTracker.tsx
    ├── lib/
    │   ├── auth.ts                    ← NextAuth config
    │   ├── db.ts                      ← Prisma client singleton
    │   ├── plaid.ts                   ← Plaid API wrapper
    │   ├── mercury.ts                 ← Mercury API wrapper
    │   ├── stripe.ts                  ← Stripe SDK wrapper
    │   ├── github.ts                  ← GitHub REST API wrapper
    │   ├── render.ts                  ← Render API wrapper
    │   ├── audit.ts                   ← Audit log helper
    │   └── utils.ts                   ← Shared utilities
    └── types/
        ├── index.ts                   ← Re-exports
        ├── auth.ts
        ├── financial.ts
        ├── crm.ts
        ├── revenue.ts
        └── dr-os.ts
```

---

## 7. Environment Variables

Create `.env.example` (committed) and `.env.local` (gitignored) with this exact set:

```bash
# ── Auth ──────────────────────────────────────────────────────────────────────
NEXTAUTH_SECRET=                    # 32+ char random string: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000  # Set to production URL on Render

# ── Database (Neon PostgreSQL — separate project from product) ────────────────
DATABASE_URL=                       # Neon pooled connection string
DATABASE_URL_UNPOOLED=              # Neon direct connection (for migrations)

# ── Plaid ─────────────────────────────────────────────────────────────────────
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=production                # sandbox | development | production
PLAID_WEBHOOK_URL=                  # https://your-domain.com/api/financial/webhook

# ── Mercury ───────────────────────────────────────────────────────────────────
MERCURY_API_KEY=                    # Read-only Mercury API key

# ── Stripe ────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=                  # sk_live_... or sk_test_...
STRIPE_PUBLISHABLE_KEY=             # pk_live_...
STRIPE_WEBHOOK_SECRET=              # whsec_... for webhook verification

# ── GitHub ────────────────────────────────────────────────────────────────────
GITHUB_TOKEN=                       # PAT with repo:read scope
GITHUB_ORG=wmorrison76              # GitHub username/org

# ── Render ────────────────────────────────────────────────────────────────────
RENDER_API_KEY=                     # Render personal API key
RENDER_SERVICE_ID=                  # Service ID for echoaurion.com

# ── AWS (AurionIndex CDK only — not used by Next.js app) ─────────────────────
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1

# ── Admin User ────────────────────────────────────────────────────────────────
ADMIN_EMAIL=                        # William's email address
ADMIN_PASSWORD_HASH=                # bcrypt hash of admin password
```

**Important:** AWS credentials are consumed by the CDK CLI, not by the Next.js runtime. They should never be exposed to client-side code.

---

## 8. Authentication

### 8.1 Strategy

- NextAuth.js v5 (Auth.js), Credentials provider
- Single admin user — no registration, no OAuth (yet)
- JWT session strategy (no database session table needed for auth)
- Session duration: 8 hours, with sliding expiry

### 8.2 Implementation

```typescript
// src/lib/auth.ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (
          credentials.email !== process.env.ADMIN_EMAIL ||
          !credentials.password
        ) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          process.env.ADMIN_PASSWORD_HASH!
        )
        if (!valid) return null

        return {
          id: 'william_morrison',
          name: 'William Morrison',
          email: process.env.ADMIN_EMAIL,
          role: 'dr_os',
        }
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as any).role
      return token
    },
    session({ session, token }) {
      session.user.role = token.role as string
      return session
    },
  },
  pages: { signIn: '/login' },
})
```

### 8.3 Role System

| Role | ID | Description |
|---|---|---|
| Dr. OS | `dr_os` | Tier 0 — full access, William Morrison |
| Computer Agent | `computer_agent` | Tier 0 — programmatic access via API token |

No other roles exist in this application.

### 8.4 Route Protection

Every route under `/dr-os`, `/aurion-index`, `/financial`, `/crm`, `/revenue` must call `auth()` from `src/lib/auth.ts` and redirect to `/login` if no session exists. Use a `middleware.ts` at the project root:

```typescript
// middleware.ts
export { auth as middleware } from '@/lib/auth'
export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon).*)'],
}
```

---

## 9. Database Schema (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}

// ── Audit ──────────────────────────────────────────────────────────────────

model AuditLog {
  id        String   @id @default(cuid())
  actor     String   // "william_morrison" | "computer_agent"
  action    String   // e.g. "crm.contact.create"
  entityId  String?
  payload   Json?
  createdAt DateTime @default(now())

  @@index([actor])
  @@index([createdAt])
  @@map("audit_log")
}

// ── Financial Monitor (schema: financial_monitor) ─────────────────────────

model PlaidItem {
  id           String   @id @default(cuid())
  itemId       String   @unique
  accessToken  String
  institutionName String
  accountType  String   // "personal_checking" | "business_checking"
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  accounts PlaidAccount[]

  @@map("plaid_items")
}

model PlaidAccount {
  id            String    @id @default(cuid())
  plaidAccountId String   @unique
  itemId        String
  item          PlaidItem @relation(fields: [itemId], references: [id])
  name          String
  type          String
  subtype       String?
  mask          String?
  createdAt     DateTime  @default(now())

  balanceSnapshots BalanceSnapshot[]
  transactions     Transaction[]

  @@map("plaid_accounts")
}

model BalanceSnapshot {
  id         String      @id @default(cuid())
  accountId  String
  account    PlaidAccount @relation(fields: [accountId], references: [id])
  available  Float?
  current    Float
  limit      Float?
  snappedAt  DateTime    @default(now())

  @@index([accountId, snappedAt])
  @@map("balance_snapshots")
}

model Transaction {
  id               String      @id @default(cuid())
  accountId        String
  account          PlaidAccount @relation(fields: [accountId], references: [id])
  plaidTransactionId String    @unique
  amount           Float
  date             DateTime
  name             String
  merchantName     String?
  category         String[]
  pending          Boolean     @default(false)
  createdAt        DateTime    @default(now())

  @@index([accountId, date])
  @@map("transactions")
}

model MercurySnapshot {
  id          String   @id @default(cuid())
  accountId   String   // Mercury account UUID
  accountName String
  available   Float
  current     Float
  snappedAt   DateTime @default(now())

  @@index([snappedAt])
  @@map("mercury_snapshots")
}

model Bill {
  id          String    @id @default(cuid())
  name        String
  amount      Float
  dueDay      Int       // day of month (1-31)
  category    String    // "rent" | "subscription" | "software" | "other"
  isActive    Boolean   @default(true)
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@map("bills")
}

// ── CRM ───────────────────────────────────────────────────────────────────

model Contact {
  id          String    @id @default(cuid())
  firstName   String
  lastName    String
  email       String?
  phone       String?
  company     String?
  title       String?
  linkedIn    String?
  tags        String[]  // ["investor", "advisor", "integration_partner", "pilot"]
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  outreach    Outreach[]
  deals       Deal[]

  @@map("contacts")
}

model Outreach {
  id          String    @id @default(cuid())
  contactId   String
  contact     Contact   @relation(fields: [contactId], references: [id])
  channel     String    // "email" | "linkedin" | "phone" | "in_person"
  subject     String?
  body        String?
  sentAt      DateTime
  status      OutreachStatus @default(SENT)
  responseAt  DateTime?
  actor       String    // "william_morrison" | "computer_agent"
  createdAt   DateTime  @default(now())

  @@index([contactId])
  @@map("outreach")
}

enum OutreachStatus {
  SENT
  OPENED
  RESPONDED
  BOUNCED
  NO_REPLY
}

model Deal {
  id          String    @id @default(cuid())
  contactId   String
  contact     Contact   @relation(fields: [contactId], references: [id])
  title       String
  value       Float?    // USD
  stage       DealStage @default(IDENTIFIED)
  notes       String?
  expectedCloseDate DateTime?
  closedAt    DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([stage])
  @@map("deals")
}

enum DealStage {
  IDENTIFIED
  CONTACTED
  RESPONDED
  MEETING
  ACTIVE
  CLOSED_WON
  CLOSED_LOST
}

// ── Revenue ───────────────────────────────────────────────────────────────

model MRRSnapshot {
  id              String   @id @default(cuid())
  mrr             Float
  customerCount   Int
  newMRR          Float    @default(0)
  churnedMRR      Float    @default(0)
  expansionMRR    Float    @default(0)
  snappedAt       DateTime @default(now())

  @@index([snappedAt])
  @@map("mrr_snapshots")
}
```

---

## 10. Module 1 — Dr. OS Dashboard

### 10.1 Overview

The nerve center of the entire Company OS. Shows real-time health of all connected systems at a glance. William should be able to determine the state of the entire EchoAurion operation in under 30 seconds from this screen.

### 10.2 Status Panels

#### GitHub Repo Health

- API: GitHub REST v3, `GET /repos/{owner}/{repo}`
- Repos to monitor: `wmorrison76/EchoAurion-Company-OS`, `wmorrison76/Echo_Aurion-LUCCCA_Framework`
- Show: last commit SHA (short, 7 chars), commit message (truncated to 60 chars), commit author, time ago, open PR count, open issue count
- Status indicator: "Active" (commit < 7 days) | "Stale" (7–30 days) | "Inactive" (30+ days)
- Always show the text label AND the icon, never just the icon

#### Render Deploy Status

- API: Render REST API v1, `GET /services/{service_id}/deploys?limit=1`
- Show: deploy status (live / deploying / failed), deploy ID, triggered at, duration in seconds
- Status badges: `✓ Live` | `↻ Deploying` | `✕ Failed`

#### Neon DB Health

- Check: attempt a `SELECT 1` via Prisma `db.$queryRaw\`SELECT 1\``
- Show: response time in ms, connection pool size, database name
- Status: `✓ Connected (NNms)` | `✕ Error: [message]`

#### Stripe MRR

- API: Stripe `stripe.subscriptions.list({ status: 'active', limit: 100 })`
- Calculate MRR: sum of all active subscription amounts (normalize annual → monthly by dividing by 12)
- Show: MRR in USD, subscription count, next billing total
- Format all currency as `$X,XXX.XX`

#### Active Users

- Query: `SELECT COUNT(*) FROM product.users WHERE last_seen > NOW() - INTERVAL '30 days'`
- Note: This queries the **product** Neon DB, not the Company OS DB. Requires a separate `PRODUCT_DATABASE_URL` env var (read-only connection).
- Show: count, "30-day active", last updated timestamp

#### Pilot Client Status — Miccosukee

- This is a manual record, not an API integration (initially)
- Table in DB: `pilots` (id, name, stage, health, last_contact, notes)
- Seed with: `{ name: "Miccosukee", stage: "ACTIVE", health: "GREEN" }`
- Show: stage badge, days since last contact, notes snippet
- Always show text label with stage, never just a color

### 10.3 Audit Trail Panel

```typescript
// Shows last 50 audit log entries, real-time via SSE or 30-second polling
// Columns: Timestamp | Actor | Action | Entity | Summary
// Actor display: "William" or "Computer" (human-readable aliases for william_morrison/computer_agent)
```

### 10.4 SSE Status Stream

```typescript
// src/app/api/dr-os/status/route.ts
export async function GET() {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const push = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // Run all status checks in parallel
      const [github, render, neon, stripe] = await Promise.allSettled([
        checkGitHub(),
        checkRender(),
        checkNeon(),
        checkStripe(),
      ])

      push({ type: 'status', github, render, neon, stripe })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

Client polls this endpoint every 60 seconds using `setInterval`. Do not use a persistent SSE connection — reconnect each poll.

---

## 11. Module 2 — AurionIndex (AWS Infrastructure Panel)

### 11.1 Purpose

AurionIndex is both:
1. An AWS CDK codebase (`/infrastructure`) defining all production AWS infrastructure
2. A Next.js panel (`/aurion-index`) showing the current state of that infrastructure

### 11.2 CDK Stack — `AurionIndexStack`

Location: `infrastructure/lib/aurion-index-stack.ts`

All resources must be tagged:
```typescript
Tags.of(this).add('Project', 'EchoAurion')
Tags.of(this).add('Environment', props.environment) // 'production' | 'staging'
Tags.of(this).add('ManagedBy', 'CDK')
```

#### VPC (`infrastructure/lib/constructs/vpc.ts`)

```typescript
const vpc = new ec2.Vpc(this, 'AurionVPC', {
  maxAzs: 2,
  natGateways: 1,
  subnetConfiguration: [
    { name: 'Public',  subnetType: ec2.SubnetType.PUBLIC,          cidrMask: 24 },
    { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
    { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 28 },
  ],
})
```

#### ECS Fargate (`infrastructure/lib/constructs/ecs-fargate.ts`)

```typescript
// Cluster
const cluster = new ecs.Cluster(this, 'AurionCluster', { vpc })

// Task Definition
const taskDef = new ecs.FargateTaskDefinition(this, 'AurionTaskDef', {
  cpu: 512,
  memoryLimitMiB: 1024,
})

// Container
taskDef.addContainer('NextJsContainer', {
  image: ecs.ContainerImage.fromEcrRepository(repo),
  portMappings: [{ containerPort: 3000 }],
  environment: { NODE_ENV: 'production' },
  secrets: {
    DATABASE_URL: ecs.Secret.fromSecretsManager(dbSecret, 'url'),
    NEXTAUTH_SECRET: ecs.Secret.fromSecretsManager(authSecret, 'value'),
    // ... all other secrets from Secrets Manager
  },
  logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'echoaurion' }),
})

// Service with Application Load Balancer
const service = new ecs_patterns.ApplicationLoadBalancedFargateService(
  this, 'AurionService', {
    cluster,
    taskDefinition: taskDef,
    desiredCount: 1,
    publicLoadBalancer: true,
    certificate: cert,
  }
)

// Auto-scaling
service.scalableTaskCount.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
  minCapacity: 1,
  maxCapacity: 4,
})
```

#### RDS PostgreSQL (`infrastructure/lib/constructs/rds-postgres.ts`)

```typescript
const db = new rds.DatabaseInstance(this, 'AurionRDS', {
  engine: rds.DatabaseInstanceEngine.postgres({
    version: rds.PostgresEngineVersion.VER_16,
  }),
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
  databaseName: 'echoaurion',
  credentials: rds.Credentials.fromSecret(dbSecret),
  backupRetention: Duration.days(7),
  deletionProtection: true,
  multiAz: false, // Set true when revenue justifies it
})
```

#### CloudFront + S3 (`infrastructure/lib/constructs/cloudfront.ts`)

```typescript
// S3 Buckets
const assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
  bucketName: `echoaurion-assets-${this.account}`,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  versioned: true,
})

const backupsBucket = new s3.Bucket(this, 'BackupsBucket', {
  bucketName: `echoaurion-backups-${this.account}`,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  lifecycleRules: [{ expiration: Duration.days(90) }],
})

const logsBucket = new s3.Bucket(this, 'LogsBucket', {
  bucketName: `echoaurion-logs-${this.account}`,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  lifecycleRules: [{ expiration: Duration.days(30) }],
})

// CloudFront Distribution
const distribution = new cloudfront.Distribution(this, 'AurionCDN', {
  defaultBehavior: {
    origin: new origins.LoadBalancerV2Origin(service.loadBalancer),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // SSR app
  },
  additionalBehaviors: {
    '/_next/static/*': {
      origin: new origins.S3Origin(assetsBucket),
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
    },
  },
  certificate: cert,
  domainNames: ['echoaurion.com', 'www.echoaurion.com'],
})
```

#### Route 53 (`infrastructure/lib/constructs/route53.ts`)

```typescript
const zone = route53.HostedZone.fromLookup(this, 'Zone', {
  domainName: 'echoaurion.com',
})

new route53.ARecord(this, 'AliasRecord', {
  zone,
  target: route53.RecordTarget.fromAlias(
    new route53_targets.CloudFrontTarget(distribution)
  ),
})
```

#### ACM Certificate

```typescript
const cert = new acm.Certificate(this, 'AurionCert', {
  domainName: 'echoaurion.com',
  subjectAlternativeNames: ['*.echoaurion.com'],
  validation: acm.CertificateValidation.fromDns(zone),
})
```

#### Secrets Manager

All app secrets are stored in AWS Secrets Manager. Use a single JSON secret per environment:

```json
{
  "DATABASE_URL": "postgres://...",
  "NEXTAUTH_SECRET": "...",
  "PLAID_CLIENT_ID": "...",
  "PLAID_SECRET": "...",
  "STRIPE_SECRET_KEY": "...",
  "MERCURY_API_KEY": "..."
}
```

Reference in CDK: `secretsmanager.Secret.fromSecretNameV2(this, 'AppSecrets', 'echoaurion/production')`

### 11.3 Estimated Monthly AWS Cost

| Service | Tier | Est. Monthly |
|---|---|---|
| ECS Fargate | 0.25 vCPU / 0.5GB, 1 task | ~$10 |
| RDS PostgreSQL | db.t4g.small, 20GB | ~$28 |
| NAT Gateway | 1 AZ | ~$32 |
| Application Load Balancer | 1 LCU baseline | ~$18 |
| CloudFront | 1TB transfer | ~$9 |
| S3 (3 buckets) | 10GB storage + requests | ~$5 |
| ACM | Free | $0 |
| Route 53 | 1 hosted zone | ~$1 |
| Secrets Manager | 5 secrets | ~$3 |
| CloudWatch Logs | 5GB | ~$3 |
| **Total** | | **~$109/month** |

Note: NAT Gateway dominates early cost. Consider removing in staging by routing all ECS traffic through public subnets with security group restrictions.

### 11.4 AurionIndex Next.js Panel (`/aurion-index`)

Show a read-only status view of the AWS stack:

- Stack deployment state (from CDK CLI output stored in DB after each deploy)
- Current ECS task count and CPU/memory utilization (CloudWatch metrics via AWS SDK)
- RDS connection status (from Dr. OS Neon check — RDS not connected until migration)
- Migration readiness checklist:
  - [ ] ECS cluster deployed
  - [ ] RDS instance running
  - [ ] Secrets migrated
  - [ ] DNS cutover complete
  - [ ] Neon → RDS data migration validated

---

## 12. Module 3 — Financial Monitor

### 12.1 Plaid Integration

```typescript
// src/lib/plaid.ts
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_SECRET!,
    },
  },
})

export const plaidClient = new PlaidApi(config)
```

#### Account Setup

William has two Plaid-connected accounts:
1. Wells Fargo personal checking
2. Wells Fargo business checking

Both require Plaid Link for initial token exchange. The `/financial` page must show a "Connect Account" button if no access tokens exist in `PlaidItem` table.

#### Plaid Link Flow

```typescript
// src/app/api/financial/plaid-link/route.ts
// POST /api/financial/plaid-link/create-link-token
// POST /api/financial/plaid-link/exchange-token
// DELETE /api/financial/plaid-link/[itemId] — revoke access
```

Use `react-plaid-link` npm package on the client side.

#### Daily Sync (Cron)

Create a cron-compatible API endpoint:
```
POST /api/financial/sync
Authorization: Bearer {CRON_SECRET}
```

This endpoint:
1. Fetches latest balances from all Plaid accounts
2. Saves `BalanceSnapshot` records
3. Fetches transactions from past 7 days, upserts by `plaidTransactionId`
4. Fetches Mercury balances, saves `MercurySnapshot`
5. Records audit log entry: `actor: "computer_agent", action: "financial.sync"`

Deploy as a Render cron job: `0 8 * * *` (8:00 AM EST daily)

### 12.2 Mercury Integration

```typescript
// src/lib/mercury.ts
const MERCURY_BASE = 'https://api.mercury.com/api/v1'

export async function getMercuryAccounts() {
  const res = await fetch(`${MERCURY_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${process.env.MERCURY_API_KEY}` },
  })
  if (!res.ok) throw new Error(`Mercury API error: ${res.status}`)
  return res.json()
}

export async function getMercuryTransactions(accountId: string, params: {
  start: string; end: string; limit?: number
}) {
  const url = new URL(`${MERCURY_BASE}/account/${accountId}/transactions`)
  url.searchParams.set('start', params.start)
  url.searchParams.set('end', params.end)
  url.searchParams.set('limit', String(params.limit ?? 500))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.MERCURY_API_KEY}` },
  })
  if (!res.ok) throw new Error(`Mercury API error: ${res.status}`)
  return res.json()
}
```

### 12.3 Financial Dashboard Panels

#### Balance Cards

Three cards, always visible at the top:
1. **Wells Fargo Personal** — current balance, available balance, last synced
2. **Wells Fargo Business** — current balance, available balance, last synced
3. **Mercury Business** — current balance, available balance, last synced

Each card shows: account name, masked account number (last 4), balance as `$X,XXX.XX`, last synced timestamp ("2 hours ago"), status badge: `✓ Synced` | `⚠ Stale (>24h)` | `✕ Error`.

Never show a number as a color change alone — always show the dollar amount.

#### Burn Rate Calculator

```typescript
// Rolling 30/60/90 day burn rate
// Formula: totalDebits / periodDays * 30 (normalized to monthly)
// Sources: all Plaid accounts + Mercury combined
// Display:
//   30-day burn: $X,XXX/month
//   60-day burn: $X,XXX/month
//   90-day burn: $X,XXX/month
//   Most reliable: 90-day (label: "90-day average")
```

#### Bill Calendar

Pre-seed `Bill` table with known recurring expenses:

| Name | Amount | Day | Category |
|---|---|---|---|
| Rent (Apple Wallet transfer) | ~$1,450 | varies | rent |
| Netflix | ~$22 | varies | subscription |
| ChatGPT Plus | $20 | varies | software |
| GitHub | $4 | varies | software |
| Render | varies | 1 | software |
| Neon | varies | 1 | software |
| Cloudflare | varies | varies | software |

Display as a simple list sorted by `dueDay`. Highlight bills due in next 7 days with a `⚠ Due Soon` badge.

#### Runway Countdown — October 1 Target

```typescript
// Runway = totalCash / monthlyBurnRate
// Display: X months, Y days until cash runs out
// October 1 countdown: if runway < oct1, show "⚠ At risk" with days short
// Always show:
//   Current total cash: $X,XXX
//   Monthly burn (90-day avg): $X,XXX
//   Months of runway: X.X months
//   Oct 1 target: [date] — N days from today
//   Status: "✓ On track" | "⚠ At risk — N days short"
```

#### Apple Wallet Transfers

Flag any transaction named containing "Apple Pay" or "Cash App" or "Zelle" in the $1,300–$1,600 range as a rent split-pay. Show monthly total in the bill calendar.

#### Monthly P&L

```typescript
// Revenue: Stripe MRR (from MRRSnapshot)
// Expenses: all debit transactions from Plaid accounts
// Net: revenue - expenses
// Show as a simple table:
//   Month | Revenue | Expenses | Net | Runway Impact
// Last 6 months by default
```

---

## 13. Module 4 — CRM

### 13.1 Contact Seeding

Pre-populate the CRM with all existing outreach contacts on first deploy. Create a Prisma seed file at `prisma/seed.ts`.

**Known Contacts to Pre-seed:**

```typescript
// Active Pilot
{ firstName: 'Giovanni', lastName: 'Genao', company: 'Miccosukee Resort & Gaming',
  title: 'Operations', tags: ['pilot'], dealStage: 'ACTIVE' }

// Advisor Target (reconnect email sent)
{ firstName: 'Robert', lastName: 'Mancuso', suffix: 'CMC',
  title: 'Hospitality Consultant', tags: ['advisor'], dealStage: 'CONTACTED' }

// Integration Partners (contacted — 18+ emails sent)
// Mews, 7shifts, Deputy, Tock, OpenTable, SevenRooms, Lightspeed, Toast,
// Amadeus, Agilysys, Shiji, Cloudbeds, Oracle OPERA, Infor HMS,
// Quore, HotSOS, Alice, Kipsu
// Each: { company: 'CompanyName', title: 'Partnership Team',
//          tags: ['integration_partner'], dealStage: 'CONTACTED' }

// Add all 46+ partners as individual Contact records with their company
```

When seeding, also create `Outreach` records for each contacted partner with `sentAt` approximately `new Date()`, `status: 'SENT'`, `actor: 'william_morrison'`.

### 13.2 Kanban Board

Route: `/crm`

Columns (left to right):
1. Identified
2. Contacted
3. Responded
4. Meeting
5. Active
6. Closed Won
7. Closed Lost

Each card shows: contact name, company, last outreach date ("N days ago"), deal value (if set), tags as small badges.

Mobile: on screens < 768px, show a list view instead of kanban (horizontal scroll kanban is not acceptable on iPhone).

### 13.3 Contact Detail Page

Route: `/crm/[id]`

Sections:
- Contact info (editable inline)
- Outreach timeline (all outreach records, newest first)
- Deal record (stage selector, value, notes, expected close date)
- Notes (free-form markdown, auto-saved)
- Add Outreach form: channel selector, subject, body, sent date

### 13.4 Gmail Integration (Read-Only)

**Note:** Full Gmail OAuth is out of scope for initial build — implement the data model and leave a hook.

Create a table-ready interface for manual outreach logging. Add a `// TODO(claude): Gmail API integration — requires OAuth scope gmail.readonly` comment in the outreach route.

When the Gmail connector is added, it should:
1. Match inbound emails by sender domain against Contact records
2. Auto-create `Outreach` records with `status: 'RESPONDED'` when a reply is detected
3. Show reply detection status in the contact card

---

## 14. Module 5 — Revenue Dashboard

### 14.1 Stripe MRR

```typescript
// src/lib/stripe.ts
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

export async function calculateMRR(): Promise<{
  mrr: number
  customerCount: number
  subscriptions: Stripe.Subscription[]
}> {
  const subscriptions = await stripe.subscriptions.list({
    status: 'active',
    limit: 100,
    expand: ['data.items'],
  })

  let mrr = 0
  for (const sub of subscriptions.data) {
    for (const item of sub.items.data) {
      const amount = item.price.unit_amount ?? 0
      const interval = item.price.recurring?.interval
      const monthly = interval === 'year'
        ? amount / 12
        : interval === 'week'
          ? amount * 4.33
          : amount
      mrr += (monthly * item.quantity) / 100 // Stripe amounts in cents
    }
  }

  return { mrr, customerCount: subscriptions.data.length, subscriptions: subscriptions.data }
}
```

Snapshot MRR daily (same cron as financial sync).

### 14.2 Runway Calculator

```typescript
// currentCash = sum of all account balances (Plaid + Mercury)
// monthlyBurn = 90-day burn rate (from financial monitor)
// runway = currentCash / monthlyBurn
// Display: N.N months (e.g., "3.2 months")
```

### 14.3 Salary Target Progress Bar

```typescript
// Target: $8,750/month MRR = founder salary replacement
// Display:
//   Progress: [$MRR / $8,750] as a horizontal bar
//   Bar segments: shape + label — not just color fill
//   Example: [████░░░░░░] $X,XXX of $8,750 (XX%)
//   Text below: "Need $X,XXX more to replace founder salary"
// Colorblind rule: bar uses width + text percentage, border distinguishes "achieved" vs "needed"
```

### 14.4 Angel Raise Tracker

```typescript
// Static configuration (update via admin panel or directly in DB)
const raiseConfig = {
  target: 500_000,     // $500K raise target
  committed: 0,        // $0 committed as of build time
  conversations: 0,    // N active conversations
}

// Display:
//   Target: $500,000
//   Committed: $0 (update manually)
//   Conversations: N (links to CRM filtered by tag: "investor")
//   Progress: [░░░░░░░░░░] $0 of $500,000 (0%)
```

Store raise tracking in a `RaiseConfig` table with a single row (upsert pattern).

### 14.5 Customer Pipeline

Show a simple table/funnel:
- Pilots (from `deals` where stage = 'ACTIVE' and tag = 'pilot')
- Paying (from Stripe active subscriptions)
- Churned (from Stripe canceled subscriptions in last 90 days)

---

## 15. Build Order

Claude Code must build in this exact sequence. Do not start the next step until the current step passes its acceptance criteria.

### Step 1 — Project Scaffold + Auth

**Deliverables:**
- `package.json` with all dependencies installed
- `next.config.ts`, `tailwind.config.ts`, `tsconfig.json` (per specs above)
- `.env.example` (all variables, no values)
- `.gitignore` (includes `.env.local`, `node_modules`, `.next`, `infrastructure/node_modules`, `infrastructure/cdk.out`)
- `prisma/schema.prisma` (full schema from Section 9)
- `src/lib/auth.ts` (NextAuth config from Section 8)
- `src/app/api/auth/[...nextauth]/route.ts`
- `middleware.ts` (route protection)
- `src/app/login/page.tsx` — login page matching design system
- `src/app/layout.tsx` — root layout with Inter font, dark background
- `src/app/page.tsx` — redirect to `/dr-os`
- `src/components/layout/Sidebar.tsx`, `TopBar.tsx`, `AppShell.tsx`

**Acceptance criteria:**
- `npm run build` passes with zero TypeScript errors
- `npm run dev` starts successfully
- Navigating to `localhost:3000` redirects to `/dr-os`
- `/dr-os` redirects to `/login` (unauthenticated)
- Login page renders correctly at 390px width
- Login with correct credentials creates a JWT session
- Login with wrong credentials shows an error message (no detail about what was wrong — just "Invalid credentials")

### Step 2 — Dr. OS Dashboard

**Deliverables:**
- All 8 status panel components (Section 10)
- `src/app/api/dr-os/status/route.ts` (SSE endpoint)
- `src/app/api/dr-os/audit/route.ts`
- `src/app/dr-os/page.tsx` — full dashboard layout
- `src/lib/github.ts`, `src/lib/render.ts`
- `src/components/ui/KPICard.tsx`, `StatusBadge.tsx`, `AuditLogRow.tsx`

**Acceptance criteria:**
- All panels render (with loading skeletons when APIs are unavailable)
- GitHub panel shows real data for both repos
- Neon panel shows connection status
- Stripe panel shows MRR (even if $0)
- Audit trail shows empty state correctly ("No actions recorded yet")
- All status badges use shape + text label, no color-only indicators
- Layout is responsive at 390px

### Step 3 — Financial Monitor

**Deliverables:**
- `src/lib/plaid.ts`, `src/lib/mercury.ts`
- All financial API routes
- All financial components
- Plaid Link integration (client-side)
- `prisma/migrations/` — auto-generated from schema
- Daily sync cron endpoint

**Acceptance criteria:**
- Plaid Link opens when "Connect Account" is clicked
- After connection, balance cards show real data
- Burn rate calculates correctly from transaction history
- Bill calendar shows all seeded bills
- Runway countdown shows correct calculation
- All monetary values formatted as `$X,XXX.XX`
- P&L summary renders for last 3 months minimum

### Step 4 — Revenue Dashboard

**Deliverables:**
- `src/lib/stripe.ts`
- All revenue API routes and components
- MRR snapshot cron integration

**Acceptance criteria:**
- MRR displays live Stripe data
- Salary target bar shows correct percentage
- Raise tracker displays configured values
- Customer pipeline links correctly to CRM
- Runway calculator uses financial monitor burn rate

### Step 5 — CRM

**Deliverables:**
- `prisma/seed.ts` — all contacts pre-seeded
- All CRM API routes
- `KanbanBoard.tsx` — drag-to-stage (or click-to-stage if drag is too complex)
- Contact detail page
- Outreach form

**Acceptance criteria:**
- 40+ contacts exist after `npx prisma db seed`
- Kanban shows correct stage columns
- Mobile view (390px) shows list instead of kanban
- Contact detail page shows full outreach timeline
- New outreach can be created and saved
- Deal stage updates save immediately (optimistic UI)

### Step 6 — AurionIndex CDK

**Deliverables:**
- Full `infrastructure/` directory
- All CDK constructs (Section 11.2)
- `infrastructure/README.md` with deploy instructions
- `/aurion-index` Next.js page showing migration checklist

**Acceptance criteria:**
- `npm run build` in `infrastructure/` passes TypeScript compilation
- `cdk synth` produces a valid CloudFormation template (requires AWS credentials)
- Cost estimate table rendered in `/aurion-index` page
- Migration checklist shows all items as unchecked (pre-migration state)

---

## 16. Package Dependencies

```json
{
  "dependencies": {
    "next": "14.2.x",
    "react": "^18.3.x",
    "react-dom": "^18.3.x",
    "typescript": "^5.x",
    "@prisma/client": "^5.x",
    "next-auth": "^5.0.0-beta.x",
    "bcryptjs": "^2.4.x",
    "plaid": "^25.x",
    "react-plaid-link": "^3.x",
    "stripe": "^16.x",
    "swr": "^2.x",
    "tailwindcss": "^3.x",
    "autoprefixer": "^10.x",
    "postcss": "^8.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x",
    "date-fns": "^3.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "prisma": "^5.x",
    "@types/node": "^20.x",
    "@types/react": "^18.x",
    "@types/react-dom": "^18.x",
    "@types/bcryptjs": "^2.x",
    "eslint": "^8.x",
    "eslint-config-next": "14.2.x",
    "prettier": "^3.x",
    "vitest": "^1.x",
    "@vitejs/plugin-react": "^4.x",
    "@testing-library/react": "^15.x",
    "@testing-library/user-event": "^14.x"
  }
}
```

CDK infrastructure has its own `package.json`:

```json
{
  "dependencies": {
    "aws-cdk-lib": "^2.x",
    "constructs": "^10.x"
  },
  "devDependencies": {
    "aws-cdk": "^2.x",
    "typescript": "^5.x",
    "ts-node": "^10.x",
    "@types/node": "^20.x"
  }
}
```

---

## 17. Sidebar Navigation

```typescript
const navItems = [
  { href: '/dr-os',       label: 'Dr. OS',          icon: 'Terminal',   description: 'System overview' },
  { href: '/financial',   label: 'Financial',        icon: 'DollarSign', description: 'Plaid monitor'   },
  { href: '/crm',         label: 'CRM',              icon: 'Users',      description: 'Pipeline'        },
  { href: '/revenue',     label: 'Revenue',          icon: 'TrendingUp', description: 'Stripe MRR'      },
  { href: '/aurion-index',label: 'AurionIndex',      icon: 'Cloud',      description: 'AWS infra'       },
]
```

Use Lucide React for icons (`npm install lucide-react`). Always render icon + label, never icon alone.

Sidebar footer shows: "William Morrison" · "Dr. OS" · Sign Out button.

---

## 18. Error Handling Conventions

```typescript
// All API routes follow this response shape:
type APIResponse<T> =
  | { success: true; data: T; meta?: { lastUpdated: string } }
  | { success: false; error: string; code?: string }

// All client-side fetch calls must handle:
// 1. Network failure (show "Connection error" badge in panel)
// 2. 401 Unauthorized (redirect to login)
// 3. 500 Server Error (show error badge with message)
// Never crash the entire dashboard because one panel fails
// Each panel is independent — use individual try/catch + SWR error state
```

Panel error state (not entire page error):
```tsx
if (error) return (
  <div className="flex items-center gap-2 text-sm text-[#a0a0b8]">
    <span aria-label="Error">✕</span>
    <span>Error: {error.message}</span>
    <button onClick={retry} className="text-[#D4AF37] underline text-xs">Retry</button>
  </div>
)
```

---

## 19. Audit Log Implementation

Every mutating action must call this helper:

```typescript
// src/lib/audit.ts
import { db } from '@/lib/db'

type Actor = 'william_morrison' | 'computer_agent'

export async function audit(
  actor: Actor,
  action: string,
  entityId?: string,
  payload?: object
) {
  await db.auditLog.create({
    data: {
      actor,
      action,
      entityId: entityId ?? null,
      payload: payload ? JSON.stringify(payload) : null,
    },
  })
}
```

Action naming convention: `module.entity.verb`

Examples:
- `crm.contact.create`
- `crm.deal.stage_update`
- `financial.plaid.sync`
- `financial.bill.create`
- `revenue.mrr.snapshot`
- `auth.session.create`

---

## 20. Render Deployment

### 20.1 `render.yaml`

```yaml
services:
  - type: web
    name: echoaurion-company-os
    env: node
    buildCommand: npm install && npx prisma generate && npm run build
    startCommand: npx prisma migrate deploy && npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: NEXTAUTH_URL
        fromService:
          name: echoaurion-company-os
          type: web
          property: host
      # All other env vars must be set manually in Render dashboard
    healthCheckPath: /api/health

  - type: cron
    name: echoaurion-company-os-sync
    env: node
    buildCommand: npm install
    startCommand: curl -X POST https://$RENDER_SERVICE_URL/api/financial/sync -H "Authorization: Bearer $CRON_SECRET"
    schedule: "0 8 * * *"  # 8:00 AM UTC daily
```

### 20.2 Health Check Endpoint

```typescript
// src/app/api/health/route.ts
export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() })
}
```

---

## 21. README.md

The `README.md` must include:
1. System overview (1 paragraph)
2. Module list with descriptions
3. Local setup instructions (`git clone`, `npm install`, `.env.local` setup, `npx prisma migrate dev`, `npm run dev`)
4. Render deployment instructions
5. AurionIndex CDK deployment instructions
6. Environment variables reference (copy of `.env.example`)
7. Colorblind accessibility note
8. "Do not deploy to production until all acceptance criteria pass"

---

## 22. Known Constraints & Gotchas

1. **Plaid Link in App Router:** Use a client component (`'use client'`) for the Plaid Link button. The Plaid webhook must be excluded from auth middleware (add `/api/financial/webhook` to the middleware matcher exclusions).

2. **Neon + Prisma:** Use `DATABASE_URL` (pooled) for app queries and `DATABASE_URL_UNPOOLED` (direct) for `prisma migrate deploy`. The `datasource` block in `schema.prisma` must include `directUrl = env("DATABASE_URL_UNPOOLED")`.

3. **NextAuth v5 + App Router:** Use `auth()` from `src/lib/auth.ts` in Server Components. In API routes, destructure: `const session = await auth()`.

4. **Stripe amounts are in cents:** Always divide by 100 when displaying. Never display cents-denominated numbers directly.

5. **Mercury API rate limits:** Mercury's sandbox has rate limits. In production, Mercury accounts may have read-only API access only — never attempt write operations.

6. **SSE in Next.js App Router:** SSE responses must return `ReadableStream` with correct headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`). Do not use `NextResponse` — use `new Response(stream, { headers })` directly.

7. **Colorblind rule enforcement:** Before completing any component, verify that removing all CSS color would still leave the UI 100% usable. If it doesn't, add shape + text indicators.

8. **Plaid transactions are eventual:** Plaid may return pending transactions that later settle with different amounts. Use `plaidTransactionId` as upsert key and always show pending status in the UI.

9. **CRM drag-and-drop:** If using `@dnd-kit/core` for kanban drag, be aware it requires client components. Alternative: click-to-stage modal (simpler, more reliable on mobile). Prefer the modal approach if drag adds significant complexity.

10. **AWS CDK version pinning:** Pin `aws-cdk-lib` and `constructs` to exact minor versions to prevent breaking changes between bootstrap and deploy.

---

## 23. Acceptance Criteria Checklist (Final)

Before marking the build complete, all items must be true:

- [ ] `npm run build` exits 0 with zero TypeScript errors
- [ ] All 5 module routes are accessible after login
- [ ] Zero "placeholder" or "coming soon" text anywhere in the UI
- [ ] All monetary values formatted as `$X,XXX.XX` using `Intl.NumberFormat`
- [ ] All status indicators use shape + text label (remove colors from CSS mentally — still usable)
- [ ] Dr. OS dashboard loads in < 3 seconds on a 4G connection
- [ ] All panels degrade gracefully when their external API is unavailable
- [ ] Audit log receives an entry on every mutation
- [ ] Plaid Link flow works end-to-end (link token → exchange → stored)
- [ ] Mercury balance displays live data
- [ ] Stripe MRR displays live data (even if $0)
- [ ] CRM seed contains 40+ contacts
- [ ] Kanban switches to list view at 390px
- [ ] CDK project compiles (`npm run build` in `infrastructure/`)
- [ ] `.env.local` is in `.gitignore` (verify with `git status`)
- [ ] `README.md` contains complete setup instructions
- [ ] Mobile layout (390px) tested for all 5 modules
- [ ] Login error message reveals no specific field information
- [ ] Health check endpoint returns `{ "status": "ok" }`
- [ ] All `aria-label` attributes present on interactive elements and status icons

---

*End of CLAUDE.md — EchoAurion Company OS Build Handoff*  
*Prepared for Claude Code (Opus 4.8) · Aurion Holdings, Inc.*
