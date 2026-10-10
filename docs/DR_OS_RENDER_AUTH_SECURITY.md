# P0 DrOS — Scheduler is not an Infrastructure Administrator

Tracks Company OS Certified Autonomous security issue #13.

## Scope of this draft

- Route: `GET/POST /api/dr-os/render-config`
- Prior behavior: either DrOS admin session **or** shared `CRON_SECRET` bearer was accepted as an authenticated actor; POST could update secret-adjacent Render environment variables and initiate deployment/cron rotation.
- New behavior: route requires a real authenticated NextAuth session with `session.user.role === 'dr_os'`. A cron bearer is NOT an administrator, even when it accompanies a forged `approvedBy` field. This applies to GET inventory and all POST branches, before Render API configuration is consulted.
- The existing operator/manual setting workflows remain available. This PR does not rotate credentials, change live Render config, remove the admin's ability to configure services, or add a machine-to-machine replacement privilege.
- Targeted tests cover cron-only GET, env writes, secret rotations, forged approver, session with insufficient role, and authorized admin GET/POST. All Render APIs are mocked.

## Critical deployment gates (human review before merging)

1. Search all schedulers, scripts, automations and call sites for `/api/dr-os/render-config`. Determine whether any rely on cron credentials for legitimate operation. Route GET/POST are intentionally incompatible with cron on merge.
2. Verify actual admin login and NextAuth role claim, and explicitly verify protected origin/CSRF on every privileged POST (separate required security task).
3. Independently review Render key allowlist: today it includes `GITHUB_TOKEN`, `STRIPE_SECRET_KEY`, `PRODUCT_DATABASE_URL`, `SUPPORT_INGEST_SECRET`, `RELAY_HANDSHAKE_REQUIRED` and other sensitive settings. An admin-only route is **not** a substitute for a narrowly scoped infrastructure approval service and independently controlled deployment key.
4. Confirm no agent can obtain/copy the admin session. Add recent reauthentication, independent approval receipt and immutable audit for security-key changes.
5. Ensure Render API key has minimum permissions and is not available in the LLM/codegen runner.
6. Non-prod staging smoke for login, list, refused cron, approved manual config; then independent security/code review, canary, rollback and owner-authorized deployment.

## Residual risk

Company OS issue #13 remains P0 until there is per-agent least privilege, cryptographically bound tenant identities, strict replay verification on relevant relay routes, human-scoped infrastructure access, safe promoted-runbook execution, hard AI spend cap, isolated generated code execution and externally verified certification. Tests are not proof of a production configuration or absence of a prompt injection.
