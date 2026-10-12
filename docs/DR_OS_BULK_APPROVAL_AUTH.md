# DrOS P0: scheduler may inspect, not approve customer replies

Security workstream: Company OS issue #13.

## Change in this draft

Endpoint: POST /api/ops/approve-all-awaiting.

Prior behavior: either a logged-in user or CRON_SECRET bearer could run bulk approvals and customer-facing Knight replies, unless caller explicitly requested dryRun=1. Production schedulers could therefore inadvertently (or if credential was leaked, intentionally) send reply drafts.

New boundary:
- Authenticated NextAuth session with role=dr_os is required for actual bulk approval.
- Cron bearer is authorized only to request a read-only preview using dryRun=1 or dryRun=true. Cron + missing/false dryRun yields 403 ADMIN_APPROVAL_REQUIRED before touching the ticket queue.
- Anonymous callers and non-admin sessions receive 401.
- The underlying approveAllAwaitingApproval dry-run path only reads candidate tickets and classifies them; it never calls approveHelpTicket. The route still writes an audit event for cron previews.
- The pre-existing FEATURE/BUILD/BILLING/core-review ticket guards remain present in the approval library. This PR does not change them.

## Independent review and migration

1. Inventory live cron jobs/scripts calling approve-all-awaiting; they must not expect this endpoint to send replies automatically after this change. Confirm intended support staffing and manual approval coverage before rollout.
2. Test actual admin role, route/middleware access, session integrity, CSRF/origin safeguards and timed expiry in non-production.
3. Test several ticket types and customer-tenancy membership with real DB fixtures; route mocks are not sufficient to certify isolation.
4. Protect source and test/workflow changes with separate trusted reviewers; follow issue #13 code-security matrix.
5. Deploy only with explicit owner approval. No production code, secrets or customer replies have been changed by this draft.

## Remaining P0 work

Cron credentials are still used by other endpoints. Split machine-to-machine identities per route and remove generic shared admin-equivalent privileges. No autonomous production code execution/self-install certification until independently verified.
