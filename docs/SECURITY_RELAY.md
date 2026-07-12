# Security — Support / Relay plane

Threat model and safe practices for Company OS ↔ pilot (luccca-web) relay.

## Threat model

| Threat | Mitigation |
|---|---|
| Ingest secret in browser bundle | Secret is **server-only** (`SUPPORT_INGEST_SECRET` / `COMPANY_OS_INGEST_SECRET`). Never `NEXT_PUBLIC_*` or `VITE_*` for secrets. Pilot client posts to same-origin `/api/company-os-relay/*`; proxy adds Bearer. |
| Secret leak → spam / abuse | Per-IP rate limits on `/api/relay/*` and diagnostics after auth. Forgot-password already rate-limited. |
| Guest PII into knowledge / snapshots | Knowledge ingest rejects forbidden keys. System snapshots are **anonymized health only** (see allowed/forbidden below). |
| Auth header leakage in logs | Relay code must never `console.log` Authorization or Bearer tokens. Log ids/status only. |
| CORS + credentials open to `*` | Company OS is same-origin Next.js; relay is server-to-server. Do not add `Access-Control-Allow-Origin: *` with credentials. |
| Unauthenticated pilot proxy abuse | Pilot proxy rate-limits by IP; questions/work prefer session when present. Status endpoint exposes booleans only (no secret). |

## Actors

- `william_morrison` — admin session mutations (audit required)
- `computer_agent` — product relay / cron (audit required on mutations)

## System snapshot — allowed vs forbidden

**Allowed (health / conflict detection):**

- Config booleans (`supportIngestSecretConfigured`, `emailConfigured`, `echoAiConfigured`)
- Versions, platforms, error counts, queue depth
- Deploy status labels, Neon latency
- Heartbeat / question **ages** (ms), outbox pending count
- Drift flags (boolean)
- Aggregate client counts

**Forbidden (never store or send to Knights):**

- Guest name / email / phone / room number
- Question or answer **body** text
- Authorization headers, access tokens, passwords
- Requester PII beyond opaque clientKey

Endpoints:

- `GET/POST /api/support/snapshot` (admin session)
- `GET /api/fleet-nexus/snapshot` (admin session)

## Safe config checklist

1. `SUPPORT_INGEST_SECRET` set on Company OS Render only
2. Identical `COMPANY_OS_INGEST_SECRET` on luccca-web (server env)
3. No `VITE_COMPANY_OS_INGEST_SECRET` / `NEXT_PUBLIC_SUPPORT_INGEST_SECRET`
4. `ECHO_AI_KEY` / brain secrets server-only
5. VAPID keys via authenticated API, not `NEXT_PUBLIC_`

## Residual risks

- In-memory rate limits are per Render instance (not global Redis)
- Shared ingest secret is a single shared secret — rotate if compromised
- Alert bodies may include short question snippets for William’s inbox (ops), not public
- SSE stream tokens are short-lived HMAC; treat like credentials

## Related

- `docs/CONNECT_PILOT_TO_COMPANY_OS.md`
- `docs/PILOT_CONNECTION.md`
- `docs/RELAY_CONTRACTS.md`
- `src/lib/knowledge-ingest.ts` — PII key reject
- `src/lib/system-snapshot.ts` — anonymized payload builder
