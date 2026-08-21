# Connect Pilot (luccca-web) ↔ Company OS

One shared secret, two Render services. No bootstrap open door — paste the same value into both dashboards.

## Exact `ECHO_AI_URL` (Chef's Brain) — paste to clear the 2 reds

Dr. OS **Connection health** shows ✕ No on `ECHO_AI_URL` and **Chef's Brain** until these are set on **echoaurion-company-os** (not on luccca-web).

**Render → echoaurion-company-os → Environment — paste:**

```text
ECHO_AI_URL=https://luccca-web.onrender.com/api/company-os/echo-brain
ECHO_AI_KEY=<same value as ECHO_BRAIN_SECRET or COMPANY_OS_INGEST_SECRET on luccca-web>
```

| Company OS env | Exact value |
|---|---|
| `ECHO_AI_URL` | `https://luccca-web.onrender.com/api/company-os/echo-brain` |
| `ECHO_AI_KEY` | Same secret as luccca-web `ECHO_BRAIN_SECRET` (or `COMPANY_OS_INGEST_SECRET`) |

**How the two booleans turn green:**

| Row | Green when |
|---|---|
| `ECHO_AI_URL` | Env var is present on Company OS after redeploy |
| Chef's Brain | Live GET probe to that URL succeeds (2xx / 401 / 403 / 405). 404 = wrong path on luccca-web |

luccca-web must expose `GET/POST /api/company-os/echo-brain`. Company OS UI has **Copy URL** / **Copy env lines** on the Connection health card.

Scout stays Active from `GOOGLE_AI_API_KEY` / `GEMINI_API_KEY`; Chef's Brain flips Active once `ECHO_AI_URL` is set **and** the probe reaches luccca-web.

Local:

```bash
# Company OS .env.local
ECHO_AI_URL=http://localhost:10000/api/company-os/echo-brain
ECHO_AI_KEY=dev-shared-secret

# luccca-web .env
ECHO_BRAIN_SECRET=dev-shared-secret
# or reuse COMPANY_OS_INGEST_SECRET
```

## Shared ingest secret (Help Desk send)

| Service | Env var | Value |
|---|---|---|
| **echoaurion-company-os** | `SUPPORT_INGEST_SECRET` | Generate once: `openssl rand -hex 32` |
| **luccca-web** | `COMPANY_OS_INGEST_SECRET` | **Identical** string |

Also on luccca-web (defaults exist in code / render.yaml):

| Env | Default if unset |
|---|---|
| `COMPANY_OS_URL` | `https://echoaurion-company-os.onrender.com` |
| `CLIENT_KEY` | `miccosukee-pilot` |

`COMPANY_OS_INGEST_SECRET` has **no** inventable default — missing → clear 503: *Set COMPANY_OS_INGEST_SECRET on luccca-web to match Company OS SUPPORT_INGEST_SECRET*.

## Render clicks

### 1. Generate one secret

```bash
openssl rand -hex 32
```

Copy the output (you'll paste it twice).

### 2. Company OS — `echoaurion-company-os`

1. [Render Dashboard](https://dashboard.render.com) → service **echoaurion-company-os**
2. **Environment** → Add / edit:
   - `SUPPORT_INGEST_SECRET` = *(paste secret)*
   - `ECHO_AI_URL` = `https://luccca-web.onrender.com/api/company-os/echo-brain`
   - `ECHO_AI_KEY` = *(same secret, or dedicated `ECHO_BRAIN_SECRET` from luccca-web)*
   - Optional: `AUTO_KNIGHTS_ON_QUESTION` = `true` (default)
3. **Save** → wait for redeploy (or Manual Deploy)

Blueprint (`render.yaml`) already lists `SUPPORT_INGEST_SECRET`, `ECHO_AI_URL`, `ECHO_AI_KEY` as `sync: false` so first Blueprint apply prompts you.

### 3. Pilot — `luccca-web`

1. Same dashboard → service **luccca-web**
2. **Environment** → Add / edit:
   - `COMPANY_OS_INGEST_SECRET` = *(same secret as SUPPORT_INGEST_SECRET)*
   - `COMPANY_OS_URL` = `https://echoaurion-company-os.onrender.com` (or leave blank — code falls back)
   - `CLIENT_KEY` = `miccosukee-pilot` (or leave blank — code falls back)
   - `ECHO_BRAIN_SECRET` = *(same secret recommended)*
   - `HELP_DESK_CHROME_ENABLED` = `true`
3. **Save** → redeploy

### 4. Smoke

```bash
# luccca-web readiness (no secret)
curl -s https://luccca-web.onrender.com/api/company-os-relay/status | jq .

# Expect: configured:true, hasSecret:true

# Chef's Brain readiness
curl -s https://luccca-web.onrender.com/api/company-os/echo-brain | jq .

# Company OS whoami
curl -s -H "Authorization: Bearer $SUPPORT_INGEST_SECRET" \
  https://echoaurion-company-os.onrender.com/api/relay/whoami | jq .
```

In-product: Help Desk icon → ask a question → Company OS Help Desk shows the TEXT thread; Knights draft when `AUTO_KNIGHTS_ON_QUESTION=true`. Avatar → **Request a build** (ADMIN / DIRECTOR / EXEC).

## Knights on inbound questions

When pilot posts via `POST /api/company-os-relay/questions` → Company OS `POST /api/relay/questions`:

1. Stores `CustomerQuestion`
2. Creates/links Help Desk **TEXT** ticket
3. **Gate policy:** `TECH` + `OTHER` auto-run Knights when `AUTO_KNIGHTS_ON_QUESTION` is true (default ON if unset). `BILLING` + `BUILD` skip auto-Knights (human / paid path). Optional `HELP_DESK_AUTO_SEND_TECH=true` auto-sends low-risk TEXT Tech/Other only — never BUILD.
4. Standby may auto-approve **low-risk TEXT only**; simple greetings (`hi` / `are you active`) auto-send on TECH/OTHER. **Echo AI tickets:** when `ECHO_AUTO_APPROVE` is true (default), auto-approve & send after Knights + always `echo_repair_ready` — set `false` for dual-control. Otherwise status stays **AWAITING_APPROVAL** for William
5. **Pilot does not see a reply until** Approve & send (or auto-approve / greeting auto-send / Echo auto-approve) publishes relay outbox `answer_ready`
6. Pilot UI waiting copy is gate-honest: TECH/OTHER say drafting + needs approval; BILLING/BUILD say “no auto-reply for this category”
7. **Talk-to-talk (pilot voice orb):** set `OPENAI_API_KEY` on **luccca-web** — without it `/api/voice/realtime` stays unavailable (not an `ECHO_AI_URL` issue; Chef's Brain is Company OS → luccca-web)

### Why “Sent” but no reply in the pilot?

Usually the ticket is sitting at **AWAITING_APPROVAL** in Company OS Help Desk. Open `/help-desk`, find the ticket (search by question id prefix if needed), review the Knights draft, click **Approve & send**.

## Connection health (Dr. OS)

Dr. OS **Connection health** card shows (booleans / ages only — never secret values):

- `SUPPORT_INGEST_SECRET` configured?
- Last pilot heartbeat age, last question age, outbox pending
- `emailConfigured`, `ECHO_AI_URL` (env present), Chef's Brain (live probe)
- When red: **How to turn green** + click-to-copy suggested URL
- **Capture system snapshot** → `POST /api/support/snapshot` (anonymized; optional Knights sandbox)

See `docs/SECURITY_RELAY.md` for allowed vs forbidden snapshot fields.

## Audit Trail (read Knights / computer sends)

On `/dr-os` → **Audit Trail**: click any row to expand full action, actor, entityId, and **redacted** payload JSON. Filters: All · Knights · Computer · Relay.

## Free support test

On `/lab/elite`: **Test free support** creates a TEXT ticket + Knights draft (no charge).

## Related

- **New buyer (not Miccosukee):** [`docs/CONNECT_NEW_BUYER.md`](./CONNECT_NEW_BUYER.md)
- Company OS: `docs/PILOT_CONNECTION.md`, `docs/SECURITY_RELAY.md`, `DEPLOY.md`
- Pilot: `docs/COMPANY_OS_RELAY_WIRING.md`
