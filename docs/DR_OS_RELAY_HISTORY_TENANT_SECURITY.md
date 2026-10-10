# DrOS P0 — Private Help Desk history must authenticate the installation

Tracks Company OS / DrOS Certified Autonomous security issue #13.

## Threat / previous behavior

GET /api/relay/questions?clientKey=...&userId=... previously accepted the fleet shared SUPPORT_INGEST_SECRET bearer. Both clientKey and userId were request parameters. A holder of that common credential could submit a different installation key and ask for that installation's questions. Filtering query results by the unverified clientKey does not itself constitute tenant authorization.

## New draft behavior — installation level only

- Read requires the *registered target installation's* own Bearer credential. Verify its SHA-256 digest against SupportClient.ingestSecretHash using constant-time comparison.
- No legacy fleet shared-token fallback, no cleartext credential fallback, no automatic new SupportClient registration, no acceptance if DB is unavailable. Missing/invalid credentials return 401; auth-store outage returns 503. Query and optional X-Echo-Client-Key must agree.
- Request IP throttling now occurs on the history route, too.
- POST questions and all other relay routes are unchanged in this draft (a separate audit and migration are still required).
- The server-side product proxy must authenticate its user before requesting a userId. **This patch does not authenticate individual end users in Company OS.** An authorized installation server can still request another userId within its own installation; that remains a certification-blocking user-delegation task.

## Must complete before operator-authorized release

1. Inventory all callers of history GET and determine which are currently using the fleet-wide secret. They must be migrated to independently random 32+ character installation credentials stored as SHA-256 digests in SupportClient.ingestSecretHash. Never place installation secrets in browser JS, query strings, agent prompts, logs or GitHub.
2. Validate that each installation has a unique secret (not the shared fleet secret) and restrict token distribution to that installation's server-to-server proxy. Require rotation/revocation plan.
3. Verify the product backend checks its logged-in user's identity and property/outlet entitlement before forwarding userId. For full zero-trust authorization, introduce a short-lived signed user delegation assertion verified by Company OS; do not infer the user's identity from a caller-selected string.
4. Include live/staging tenancy fixtures, privacy leakage/PII review, handling of 401/503 in customer UI and emergency rollback.
5. Independently review auth/security workflow PR with CODEOWNERS/rulesets. Avoid merging while client rollout is incomplete.

## Test scope

Focused tests cover own-install acceptance, property A trying property B, shared secret rejected, no registration, blank/short/legacy secret rejected, spoofed header, DB outage, malformed keys and evidence that no user-level claims are minted.

A passed test does NOT certify all relay endpoints or prove production configuration; it is an isolated, intentionally breaking security hardening draft.
