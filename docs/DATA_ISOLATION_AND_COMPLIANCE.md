# Data Isolation & Compliance

**Branch:** `claude/vigilant-rubin-DtQE3`  
**Mandate:** William Morrison — customer data isolation, protect-data-first repairs, triple-layer handshake, SOC 3 scrutiny readiness, HIPAA-oriented controls for hospitality ops telemetry.

Related: `docs/SECURITY_RELAY.md`, `docs/ECHO_LEARNING_PLANE.md`, `docs/ERROR_CAPTURE_AND_SCOPE.md`, `docs/KNIGHTS_FLYWHEEL.md`.

---

## Tenant isolation (prose diagram)

```
Pilot Property A (clientKey=A)          Pilot Property B (clientKey=B)
        │                                         │
        │  Layer1 secret + Layer2 clientKey       │
        │  + Layer3 timestamp/nonce               │
        ▼                                         ▼
   Company OS relay ingest ───────────────►  HelpTicket(A) only
                                              HelpTicket(B) only
        │
        ├─ ErrorPattern (fingerprint aggregates, sampleMessage redacted — no guest PII)
        ├─ KnightRunbook (pattern/steps only; core-path deny)
        └─ EchoKnowledgeChunk
              ├─ ACCOUNT + clientKey  → NEVER returned by fleet retrieve
              ├─ COHORT / GLOBAL      → only after assertPiiFree + scrub
              └─ Promote to fleet     → William / eval gate (not silent)

Repair / Knights prompt:
  sanitizeAgentThreadForTenant → no other tenant’s customer body
  WorkRequest.clientKey = ticket.clientKey

Notify-when-fixed GLOBAL:
  canary → affected_only → fleet (William promoteCanaryToFleet)
  Never auto-ALL on first resolve
```

**Non-negotiable:** Company A’s tickets, messages, ACCOUNT knowledge, and WorkRequests never merge into Company B’s context. GLOBAL/COHORT carry **redacted patterns only**.

---

## Triple-layer handshake

| Layer | Mechanism | Headers / env |
|---|---|---|
| **1 — Shared secret / HMAC** | `Authorization: Bearer` | `SUPPORT_INGEST_SECRET`, `ECHO_AI_KEY` / `KNOWLEDGE_INGEST_SECRET`, `CRON_SECRET`, `GITHUB_WEBHOOK_SECRET` (`X-Hub-Signature-256`) |
| **2 — Tenant identity** | `clientKey` bound to request; `X-Echo-Client-Key` must match body; SupportClient registry (soft) + system keys `github/`, `render/`, `company-os-*` | Body/query + header |
| **3 — Request binding** | Timestamp skew (±5m) + unique nonce (replay table `request_nonces`) + optional SHA-256 payload hash | `X-Echo-Timestamp`, `X-Echo-Nonce`, `X-Echo-Payload-Hash` |

**Soft → hard:** Missing Layer-3 headers are allowed until `RELAY_HANDSHAKE_REQUIRED=true` (pilot rollout). When headers **are** present, skew + nonce uniqueness are always enforced. GitHub uses `X-GitHub-Delivery` as the nonce.

Implementation: `src/lib/request-handshake.ts`, `src/lib/tenant-isolation.ts`, `src/lib/relay-auth.ts`.

---

## What is stored vs forbidden

| Allowed | Forbidden |
|---|---|
| Opaque `clientKey`, fingerprints, redacted stacks/messages | Guest name/email/phone/room/loyalty |
| Anonymized error patterns, runbook steps | Staff PII, investor CRM free-text in learning |
| Health/config booleans, versions, queue depth | Authorization headers, secrets, JWTs |
| GLOBAL/COHORT scrubbed procedures | PHI / health-adjacent free text in learning |
| Audit log of mutations + clientKey | Raw PDF bytes (book-ingest accepts extracted text only) |

Redaction: `src/lib/error-redact.ts` (`redactSensitive`, `assertPiiFree`). PII key deny-list: `src/lib/knowledge-ingest.ts`.

---

## SOC 3 / HIPAA-oriented control map

Company OS is **not** a covered entity by default; hospitality may touch health-adjacent guest notes. Treat repair/learning telemetry as **forbidden for PHI**. Full SOC 3 / BAA remain legal/process work for William — code enforces technical controls below.

| Control | Code / ops enforcement | Gap (legal / process) |
|---|---|---|
| **Access control** | NextAuth admin session; relay Bearer secrets; middleware excludes only intentional public routes | Formal role matrix for future staff |
| **Encryption in transit** | HTTPS (Render / Cloudflare); no secret in browser | Certificate inventory for auditor |
| **Encryption at rest** | Neon / Render managed disk encryption | Document provider SOC reports |
| **Audit log** | `audit_log` on mutations; clientKey in payload for sensitive paths | Retention policy sign-off (recommend 1–7y) |
| **Least privilege** | Cron/webhook secrets scoped; draft PR only; core-path deny | IAM review of GitHub/Render tokens |
| **Data minimization** | Redact + `assertPiiFree`; ACCOUNT never on retrieve; slim error-event responses | DPA with LLM providers |
| **Tenant isolation** | Per-`clientKey` ticket dedupe; knowledge scope gates; notify affected-only until fleet | Pre-register SupportClients (optional harden) |
| **Retention** | `request_nonces` TTL 24h; recommend ticket/message retention schedule | Formal retention + deletion runbook |
| **Breach notification hooks** | Alerts on scope promote / critical ingest; audit trail | Incident response plan + counsel |
| **HIPAA-oriented** | Health-adjacent scrub; no PHI in GLOBAL learning | BAA if ever handling ePHI; workforce training |

---

## Repair path (protect data first)

1. Ingest verifies handshake + tenant `clientKey`.
2. Ticket created/deduped **only** for that `clientKey`.
3. Agent/Knights see sanitized thread — no cross-tenant customer bodies.
4. Runbook promote → Echo learn only after redact + `assertPiiFree` for GLOBAL.
5. Notify: USER/ACCOUNT = that tenant; GLOBAL = canary / affected / fleet (explicit).

---

## Retention recommendations

| Data | Recommend |
|---|---|
| `request_nonces` | 24h (code TTL) |
| HelpTicket SYSTEM messages | 90–365 days then archive |
| EchoKnowledgeChunk GLOBAL | Indefinite scrubbed patterns; quarterly PII spot-check |
| Audit log | ≥ 1 year (SOC-oriented); 7 years if investor/compliance asks |
| KnowledgeSignal payloads | 90 days |

---

## Residual risks (second-pass)

1. **Shared fleet secret** — compromise of `SUPPORT_INGEST_SECRET` still allows spoofing any `clientKey` until per-install secrets exist. Mitigate: rotate + set `RELAY_HANDSHAKE_REQUIRED=true` + monitor unregistered client audits.
2. **LLM providers** may see redacted SYSTEM prompts — **never put PHI in prompts**; execute DPAs with Anthropic/OpenAI/Google.
3. **In-memory rate limits** are per Render instance — Redis next.
4. **SupportClient auto-provision** on heartbeat — soft registry; pre-approve installs for hard isolation.
5. **SOC 3 / HIPAA BAA** are out of band — code is scrutiny-ready, not an attestation.

---

## Deploy notes

1. `npx prisma migrate deploy` → includes `20260712220000_tenant_isolation_handshake`
2. Deploy Company OS, then pilot (luccca-web) so handshake headers ship
3. Optional: `RELAY_HANDSHAKE_REQUIRED=true` after pilot confirmed
4. Confirm `GITHUB_WEBHOOK_SECRET`, `SUPPORT_INGEST_SECRET`, `CRON_SECRET` set
