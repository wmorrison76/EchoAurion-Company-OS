# Open Ops Checklist — William

Manual Render / GitHub steps that code cannot finish without secrets pastes.
**Do not claim secrets were set without Render dashboard or API access.**

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
| `CRON_SECRET` | Also guards `/api/ops/cost-anomaly` + `/api/ops/help-eval-friday` |

### Suggested Render crons (optional)

| Schedule | URL |
|---|---|
| Thu 22:00 UTC | `POST /api/ops/help-eval-friday` |
| Daily (e.g. after financial sync) | `POST /api/ops/cost-anomaly` |

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

## 4. GitHub webhook + ops-poll

| Item | Action |
|---|---|
| Webhook URL | `https://<company-os-host>/api/webhooks/github` |
| Events | `workflow_run`, `check_suite`, `pull_request` (Bugbot / CI failures) |
| Secret | Set `GITHUB_WEBHOOK_SECRET` on Company OS to match GitHub webhook secret |
| Ops poll cron | `echoaurion-company-os-ops-poll` in `render.yaml` — needs `CRON_SECRET` + `WEB_SERVICE_URL` / `RENDER_SERVICE_URL` |
| Manual test | `POST /api/ops/poll-failures` with `Authorization: Bearer $CRON_SECRET` |

Docs: `docs/ERROR_CAPTURE_AND_SCOPE.md`, `docs/CRON_SECRET_SETUP.md`.

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

## 6. Render API (optional)

If `RENDER_API_KEY` is available in the operator environment, matching secrets can be set via Render API. **Never print secret values.** This checklist does not assume API access — paste in the Render dashboard when needed.

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
