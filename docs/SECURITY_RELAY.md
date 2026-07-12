# Security — Support / Relay plane

Threat model and safe practices for Company OS ↔ pilot (luccca-web) relay.

**Data isolation & compliance:** see `docs/DATA_ISOLATION_AND_COMPLIANCE.md` (tenant boundaries, SOC 3 / HIPAA-oriented control map, retention).

## Triple-layer handshake

Sensitive cross-system calls (relay ingest, Echo retrieve, agent loop ingress, GitHub webhooks) use three layers:

| Layer | What | How |
|---|---|---|
| **1** | Shared secret / HMAC | `Authorization: Bearer` (`SUPPORT_INGEST_SECRET`, `ECHO_AI_KEY`, `CRON_SECRET`) or `X-Hub-Signature-256` |
| **2** | Tenant identity | `clientKey` + registered/system SupportClient; `X-Echo-Client-Key` must match body |
| **3** | Request binding | `X-Echo-Timestamp` (±5m skew) + `X-Echo-Nonce` (replay table) + optional `X-Echo-Payload-Hash` |

Pilot proxy (`luccca-web` `/api/company-os-relay`) attaches Layer-3 headers on every forward. Soft mode allows missing headers until `RELAY_HANDSHAKE_REQUIRED=true`. Replays → `409 REPLAY_REJECTED` (GitHub delivery → `202` ack without re-ingest).

Code: `src/lib/request-handshake.ts`, `src/lib/tenant-isolation.ts`.

## Threat model

| Threat | Mitigation |
|---|---|
| Ingest secret in browser bundle | Secret is **server-only** (`SUPPORT_INGEST_SECRET` / `COMPANY_OS_INGEST_SECRET`). Never `NEXT_PUBLIC_*` or `VITE_*` for secrets. Pilot client posts to same-origin `/api/company-os-relay/*`; proxy adds Bearer + handshake. |
| Secret leak → spam / abuse | Per-IP rate limits on `/api/relay/*` and diagnostics after auth. Forgot-password already rate-limited. Nonce replay rejection. |
| Cross-tenant ticket merge | Error-event dedupe is **per clientKey**; responses omit full ticket bodies. |
| Guest PII into knowledge / snapshots | Knowledge ingest rejects forbidden keys + value redact. GLOBAL writes require `assertPiiFree`. System snapshots are **anonymized health only**. |
| Auth header leakage in logs | Relay code must never `console.log` Authorization or Bearer tokens. Log ids/status only. |
| CORS + credentials open to `*` | Company OS is same-origin Next.js; relay is server-to-server. Do not add `Access-Control-Allow-Origin: *` with credentials. |
| Unauthenticated pilot proxy abuse | Pilot proxy rate-limits by IP; questions/work prefer session when present. Status endpoint exposes booleans only (no secret). |
| Client-claimed GLOBAL / canary hijack | `scopeHint: GLOBAL` capped to ACCOUNT; canary keys operator-set only; fleet notify requires stage `fleet`. |

## Actors

- `william_morrison` — admin session mutations (audit required)
- `computer_agent` — product relay / cron (audit required on mutations; include `clientKey` in payload when tenant-sensitive)

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
- Question or answer **body** text from another tenant
- Authorization headers, access tokens, passwords
- Requester PII beyond opaque clientKey
- Health-adjacent / PHI free text in learning chunks

Endpoints:

- `GET/POST /api/support/snapshot` (admin session)
- `GET/POST /api/fleet-nexus/snapshot` (admin session)

## Safe config checklist

1. `SUPPORT_INGEST_SECRET` set on Company OS Render only
2. Identical `COMPANY_OS_INGEST_SECRET` on luccca-web (server env)
3. No `VITE_COMPANY_OS_INGEST_SECRET` / `NEXT_PUBLIC_SUPPORT_INGEST_SECRET`
4. `ECHO_AI_KEY` / brain secrets server-only
5. VAPID keys via authenticated API, not `NEXT_PUBLIC_`
6. After pilot handshake deploy: set `RELAY_HANDSHAKE_REQUIRED=true`
7. `GITHUB_WEBHOOK_SECRET` set for CI/Bugbot ingest

## Residual risks

- In-memory rate limits are per Render instance (not global Redis)
- Shared ingest secret is a single shared secret — rotate if compromised; prefer per-install secrets later
- Alert bodies may include short question snippets for William’s inbox (ops), not public
- SSE stream tokens are short-lived HMAC; treat like credentials
- Soft handshake until required flag — deploy pilot headers first
- LLM providers see redacted prompts — DPA + no PHI (see DATA_ISOLATION_AND_COMPLIANCE.md)

## Related

- `docs/DATA_ISOLATION_AND_COMPLIANCE.md`
- `docs/CONNECT_PILOT_TO_COMPANY_OS.md`
- `docs/PILOT_CONNECTION.md`
- `docs/RELAY_CONTRACTS.md`
- `src/lib/knowledge-ingest.ts` — PII key reject
- `src/lib/system-snapshot.ts` — anonymized payload builder
- `src/lib/tenant-isolation.ts` — tenant guards
- `src/lib/request-handshake.ts` — Layer 3
