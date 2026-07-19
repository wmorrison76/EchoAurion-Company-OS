# Open Ops Checklist — William

Manual Render / GitHub steps that code cannot finish without secrets pastes.
**Do not claim secrets were set without Render dashboard or API access.**

**Knights / exception flywheel ≠ Render secrets.** Round Table seats never receive `RENDER_API_KEY` (not in prompts, not in Help Desk tickets). If Dr. OS shows Not configured / Unknown / Config debt:

1. **William pastes once:** `RENDER_API_KEY` (+ usually `RENDER_SERVICE_ID`) on **Company OS web** Environment.
2. Then **computer_agent** / authenticated Dr. OS admin (and local Perplexity/Cursor with the key in `.env.local`) can upsert allowlisted vars via `POST /api/dr-os/render-config` — never by stuffing the key into Knights.

**Dr. OS code-complete checklist** (what’s done vs these clicks): [`DR_OS_COMPLETE.md`](./DR_OS_COMPLETE.md) — includes **Panel → env checklist**.

---

## 0. Dr. OS panel greens (paste list for current reds)

| If panel says… | Paste on Render |
|---|---|
| GitHub Unknown / “token needs repo read” / commits 404 | `GITHUB_TOKEN` (PAT with repo read; private repos 404 without access) |
| Render Not configured | `RENDER_API_KEY` + `RENDER_SERVICE_ID` |
| Stripe Not configured | `STRIPE_SECRET_KEY` |
| Active Users · PRODUCT_DATABASE_URL | `PRODUCT_DATABASE_URL` (read-only product DB) |
| Connection · Secret missing | `SUPPORT_INGEST_SECRET` (= luccca-web `COMPANY_OS_INGEST_SECRET`) |
| Connection · ECHO_AI_URL No / Chef's Brain unset | `ECHO_AI_URL=https://luccca-web.onrender.com/api/company-os/echo-brain` + `ECHO_AI_KEY` |
| Pilot No pilot record | Fixed in code after deploy (Miccosukee auto-ensure) — no env |
| GitHub Inactive (with a real SHA/message) | Not env — last commit &gt;30 days; push code or ignore |

After paste → Save → wait for redeploy → hard-refresh `/dr-os`. Config debt panel should shrink; daily SYSTEM config-debt ticket is a reminder only (no Knights).

---

## 1. Migrations already in repo (deploy with `prisma migrate deploy`)

These exist under `prisma/migrations/` and must be applied on Neon after each Company OS deploy:

| Migration | Purpose |
|---|---|
| `20260712200000_knights_flywheel` | Flywheel: COHORT, canary, KnightRunbook, KnightEval |
| `20260712210000_scale_and_echo_learning` | IngestJob queue, EchoKnowledgeChunk, fingerprint indexes |
| `20260712220000_tenant_isolation_handshake` | RequestNonce + tenant-scoped fingerprint index |
| `20260712230000_support_roadmap_frameworks` | intakeGate, intakeChannel, ingestSecretHash, CustomerCostSnapshot |
| `20260712240000_support_p0_sla_csat_channels` | SLA clocks, CSAT, EMAIL/SMS channels, HelpArticle public/isMacro, WorkAgreement invoice fields |

**Deploy note:** Render startCommand already runs `npx prisma migrate deploy`. If a migration fails, check `DATABASE_URL_UNPOOLED` (direct) vs pooled `DATABASE_URL`.

**Knowledge Plane after deploy:** Open `/knowledge-plane` → **Backfill learning** (or `POST /api/knowledge/backfill`). Expect non-zero chunks/signals if PROMOTED runbooks or ops Help Files exist. Ops-poll cron drains the learning queue (`CRON_SECRET`). See `docs/ECHO_LEARNING_PLANE.md`.

---

## 1b. Support P0 env (after migrate)

| Env var | Purpose |
|---|---|
| `SUPPORT_EMAIL_WEBHOOK_SECRET` | Bearer for `POST /api/webhooks/support-email` (or reuse ingest secret) |
| `SUPPORT_SMS_WEBHOOK_SECRET` | Bearer for `POST /api/webhooks/support-sms` (or reuse ingest secret) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Live IVR + SMS status send |
| `SUPPORT_IVR_PUBLIC_URL` | Exact public webhook URL Twilio signs |
| `SUPPORT_IVR_WEBHOOK_SECRET` | Optional IVR Bearer override |
| Stripe keys (existing) | Auto-create + send Invoice on WorkAgreement authorize |
| `CRON_SECRET` | Also guards `/api/ops/cost-anomaly` + `/api/ops/help-eval-friday` + `/api/ops/night-cleaner-report` |

### Suggested Render crons (optional)

| Schedule | URL |
|---|---|
| Thu 22:00 UTC | `POST /api/ops/help-eval-friday` |
| Daily (e.g. after financial sync) | `POST /api/ops/cost-anomaly` |
| Nightly after close / before open | Pilot night-cleaner script → `POST /api/ops/night-cleaner-report` (Bearer `CRON_SECRET`) |

Night cleaner = morning-open **task list** (SYSTEM/TECH tickets), not silent merges. See [`NIGHT_CLEANER_MOLE.md`](./NIGHT_CLEANER_MOLE.md).

See `docs/SUPPORT_90_DAY_PLAN.md` · `docs/SUPPORT_SMS.md` · `docs/HELP_EVAL.md` · `docs/PILOT_PR_202_REBASE_NOTES.md`.

---

## 2. Help Desk secret pairing (whoami 401 = secret is live)

| Side | Env var | Service |
|---|---|---|
| Company OS | `SUPPORT_INGEST_SECRET` | `echoaurion-company-os` (Render) |
| luccca-web (pilot) | `COMPANY_OS_INGEST_SECRET` | Must be **byte-identical** to Company OS |

**Diagnose:**

```bash
# Company OS — 401 UNAUTHORIZED means SUPPORT_INGEST_SECRET is set (secret live)
# but Bearer does not match. 503 RELAY_DISABLED means secret missing on Company OS.
curl -sS -H "Authorization: Bearer $SUPPORT_INGEST_SECRET" \
  https://<company-os-host>/api/relay/whoami
```

If Company OS whoami returns **401** with a wrong bearer → secret is configured.
If luccca-web Help Desk still fails → paste the **same** value into luccca-web `COMPANY_OS_INGEST_SECRET` and restart.

See `docs/CONNECT_PILOT_TO_COMPANY_OS.md`.

---

## 3. After both handshake deploys

When Company OS **and** luccca-web both ship Layer-3 handshake headers:

1. Confirm pilot `server/routes/company-os-relay.ts` attaches `X-Echo-Timestamp`, `X-Echo-Nonce`, `X-Echo-Client-Key`, `X-Echo-Payload-Hash`.
2. On Company OS Render → set:
   ```
   RELAY_HANDSHAKE_REQUIRED=true
   ```
   (optional: `RELAY_HANDSHAKE_SKEW_MS=300000`)
3. Soft period: leave unset/`false` until both sides are live, then flip to hard require.

---

## 4. GitHub webhook + ops-poll + cron secrets

**Flash:** If **all** Company OS crons show Failed run, set `CRON_SECRET` on **each cron service** (not only web). See `docs/CRON_SECRET_SETUP.md`. Cannot set from this repo without Render API key.

| Item | Action |
|---|---|
| Webhook URL | `https://<company-os-host>/api/webhooks/github` |
| Events | `workflow_run`, `check_suite`, `pull_request` (Bugbot / CI failures) |
| Secret | Set `GITHUB_WEBHOOK_SECRET` on Company OS to match GitHub webhook secret |
| Ops poll cron | `echoaurion-company-os-ops-poll` in `render.yaml` — needs `CRON_SECRET` + `WEB_SERVICE_URL` / `RENDER_SERVICE_URL` |
| ops-poll missing? | Search Super_Admin + other folders; create from Blueprint if absent — without it agent_loop / failure tickets stall |
| Manual test | `POST /api/ops/poll-failures` with `Authorization: Bearer $CRON_SECRET` |
| Railway | **Optional skip** — scaffold only (`/api/webhooks/railway`, poll returns `skipped`). Prefer retire Railway; Render captures deploys. Do not set Railway secrets unless a service still exists |

Docs: `docs/ERROR_CAPTURE_AND_SCOPE.md`, `docs/CRON_SECRET_SETUP.md`, `docs/UPDATE_WITHOUT_LOSING_WORK.md`.

---

## 5. Pilot PR #202 rebase (CONFLICTING — do not force-merge)

**Status:** PR [#202](https://github.com/wmorrison76/Echo_Aurion-LUCCCA_Framework/pull/202) is **OPEN / CONFLICTING** (~790 commits ahead of `main`, ~51 conflict files). Rebase is high-risk for Help Desk / relay / AppFull / lockfile.

**Exact commands (William or agent when ready for a dedicated conflict session):**

```bash
cd /path/to/Echo_Aurion-LUCCCA_Framework
git fetch origin main
git checkout claude/laughing-noether-lSZwe
# Prefer merge for safety of non-linear history; or rebase if linear history required:
git merge origin/main
# OR: git rebase origin/main
# Resolve conflicts carefully — preserve:
#   client/components/support/HelpDeskChrome.tsx
#   server/routes/company-os-relay.ts
#   client/lib/company-os-relay/**
#   client/lib/error-capture/**
git push origin HEAD   # if rebase: may need --force-with-lease ONLY if William explicitly approves
```

**Do not force-merge** the GitHub PR while CONFLICTING. Leave CONFLICTING until conflicts are resolved in a focused session.

---

## 6. Render API — who gets access (secure)

| Who | Gets `RENDER_API_KEY`? | How they fix config debt |
|---|---|---|
| **William** | Pastes **once** on Company OS web (Render Environment) | Dashboard paste, or Dr. OS Config debt button, or API while logged in |
| **computer_agent** | Uses key **only from server env** (never in prompts) | `POST /api/dr-os/render-config` with `Authorization: Bearer $CRON_SECRET` |
| **Perplexity / Cursor (local)** | Optional in **`.env.local`** for local agents | Same API against localhost or call Render from the agent host env — **never print values** |
| **Knights Round Table** | **No** — seats never receive the key | Open a William/config reminder only; do not invent keys |

**Company OS API (preferred):**

```bash
# List services (ids/names only — no env values)
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://<company-os-host>/api/dr-os/render-config

# Apply suggested Chef's Brain URL (server uses SUGGESTED_ECHO_AI_URL; triggers redeploy)
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"apply":"echo_ai_url"}' \
  https://<company-os-host>/api/dr-os/render-config

# Upsert allowlisted keys (values in body only — never logged/audited)
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"service":"echoaurion-company-os","env":{"ECHO_AI_URL":"https://luccca-web.onrender.com/api/company-os/echo-brain"},"redeploy":true}' \
  https://<company-os-host>/api/dr-os/render-config
```

Dr. OS **Config debt** panel: **Apply suggested ECHO_AI_URL via Render** when the key is present; otherwise shows **set RENDER_API_KEY first**.

Audit action: `dr_os.render_config.*` — payload has **key names only**, never values. **Never print secret values.**

---

## 7. Billing portal (no Dr. OS login)

| Item | Action |
|---|---|
| Create contact | Dr. OS / Support → billing contacts API creates token (**shown once**) |
| Customer URL | `https://<company-os-host>/portal/billing` |
| Auth | Paste token → quote history + agreement/invoice status |

---

## 8. Next: competitive gaps

Deep competitive analysis of automated + human tech support → what’s missing to be #1:

- **[`docs/SUPPORT_COMPETITIVE_ANALYSIS.md`](./SUPPORT_COMPETITIVE_ANALYSIS.md)** — sibling-authored analysis (use this as the gap roadmap)
- Framework docs already on this branch: `SUPPORT_ANALYTICS.md`, `SUPPORT_VOICE.md`, `SUPPORT_IVR.md`, `CUSTOMER_AI_COST.md`
- Remaining process (not code): SOC2 Type II kickoff

---

## 9. Diligence + training (docs)

| Doc | Purpose |
|---|---|
| [`DILIGENCE_409A_DATAROOM.md`](./DILIGENCE_409A_DATAROOM.md) | Light data-room narrative + screenshot/export checklist (not a valuation) |
| [`OPS_TRAINING_MANUAL.md`](./OPS_TRAINING_MANUAL.md) | Day-one operator guide — Help Desk, gates, secrets, crons, Fleet, CSAT, **14-language Knights** |

### Multilingual (shipped)

Pilot language picker (14 locales) → Help Desk forwards `locale` → Knights reply in customer language. See OPS training § Multilingual. RTL (`ar`, `he`) handled by product chrome; operator notes stay English LTR.