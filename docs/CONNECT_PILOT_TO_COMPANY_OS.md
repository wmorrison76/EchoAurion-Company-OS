# Connect Pilot (luccca-web) ↔ Company OS

One shared secret, two Render services. No bootstrap open door — paste the same value into both dashboards.

## Exact `ECHO_AI_URL` (Chef's Brain)

After luccca-web deploys with `/api/company-os/echo-brain`:

```text
ECHO_AI_URL=https://luccca-web.onrender.com/api/company-os/echo-brain
ECHO_AI_KEY=<same value as ECHO_BRAIN_SECRET or COMPANY_OS_INGEST_SECRET on luccca-web>
```

Set both on **echoaurion-company-os** (Render → Environment). Scout stays Active from `GOOGLE_AI_API_KEY` / `GEMINI_API_KEY`; Chef's Brain flips Active once `ECHO_AI_URL` is set.

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
3. If `AUTO_KNIGHTS_ON_QUESTION` is true (default) **or** standby/autonomy allows drafts → runs Knights
4. Standby may auto-approve **low-risk TEXT only**; otherwise status stays **DRAFTED / AWAITING_APPROVAL** for William
5. Auto-approve publishes relay outbox so the pilot can pull the answer

## Connection health (Dr. OS)

Dr. OS **Connection health** card shows (booleans / ages only — never secret values):

- `SUPPORT_INGEST_SECRET` configured?
- Last pilot heartbeat age, last question age, outbox pending
- `emailConfigured`, `ECHO_AI_URL` / Chef's Brain configured?
- **Capture system snapshot** → `POST /api/support/snapshot` (anonymized; optional Knights sandbox)

See `docs/SECURITY_RELAY.md` for allowed vs forbidden snapshot fields.

## Free support test

On `/lab/elite`: **Test free support** creates a TEXT ticket + Knights draft (no charge).

## Related

- Company OS: `docs/PILOT_CONNECTION.md`, `docs/SECURITY_RELAY.md`, `DEPLOY.md`
- Pilot: `docs/COMPANY_OS_RELAY_WIRING.md`
