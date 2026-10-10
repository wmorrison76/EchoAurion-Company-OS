# DrOS replay protection: independent security review required

Tracking: Company OS Certified Autonomous security issue #13.

## Draft change

Previous nonce verification used a PostgreSQL unique constraint when available, but silently accepted an in-memory fallback if database persistence failed. Multi-instance requests could evade that local fallback, which undermines replay resistance.

This draft removes the fallback:
- An accepted handshake must first persist its nonce atomically in the shared RequestNonce store.
- Duplicate requests receive 409 REPLAY_REJECTED.
- Database/migration outages receive 503 REPLAY_STORE_UNAVAILABLE and no side effects may proceed.
- Tenant identity and payload hash mismatches are rejected before claiming a nonce.

Focused CI tests exercise the above with mocked store failures. No live-provider data or credentials are involved.

## Critical exclusions and follow-on work

- **This does not yet require Layer-3 handshake everywhere.** The compatibility setting RELAY_HANDSHAKE_REQUIRED currently defaults soft/off, and routes must invoke the validator. A separate human-approved migration must enumerate and secure every relay/cron/webhook route, provision correct request signatures, and only then switch production to strict mode. Until then the overall P0 auth problem remains open.
- **Headers are not identity by themselves.** A shared relay secret with caller-selected clientKey is not cryptographic per-tenant authorization. Implement independently scoped installation identity and validate account membership on every route (issue #13).
- **SHA-256 payload hash alone is not a MAC.** It must be covered by authenticated request signing and verified at the gateway. No claim of strong transport identity follows from hash matching.
- **Preserve API availability controls.** Durable store outages intentionally block protected writes. Ensure legitimate callers handle 503 with bounded retry and idempotency; do not silently change to GET or memory-only processing.
- **Independent review:** Auth-adjacent code, security workflows, and nonce policy require independent human approval. Do not merge/deploy as an agent. Validate database migration availability, credential scope, request origin, multi-worker replays and service monitoring in staging before release.

## Certification gate

Hostile input must fail even if the AI model follows attacker instructions. The backend authorizer is responsible for verifying tenant-bound identity, nonce and action scope; a passing simulation or unit test is not evidence of Certified Autonomous status.
