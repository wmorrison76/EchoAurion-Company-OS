# DrOS Certified Autonomous: security admission before authority expansion

Tracking: security issue #13. Distinct from adaptive capability PR #12 and live MEWS agent lane.

## First implemented patch (DRAFT, NOT DEPLOYED)

- `envEchoAutoApprove()` and `envHelpDeskAutoApprove()` now default to false (including invalid/blank values); only explicit true/1/yes/on permit low-risk TEXT auto-approval.
- `envHelpDeskAutoSendTech()` already required affirmative opt-in; keep that rule.
- `shouldAutoKnightsOnQuestion()` may still initiate DRAFT-ONLY counsel by default, but an explicit false is a hard off switch and cannot be bypassed by AUTONOMY_DIAL or KNIGHTS_STANDBY_MODE.
- Safety tests prove missing/malformed/negative flags deny, explicit positive grants only the existing low-risk path, and draft-only Knights do not grant auto-send.
- A scoped PR CI gate runs targeted tests and TS typecheck.
- **Important**: Explicitly enabling an environment flag does not substitute for tenant authorization, payload classification, work approval, or security certification. Audit the downstream ticket-level autoapproval call sites separately.

## Human review and rollout checklist

1. Verify all actual deployed env values privately (Render): ECHO_AUTO_APPROVE, HELP_DESK_ECHO_AUTO_APPROVE, HELP_DESK_AUTO_APPROVE, HELP_DESK_AUTO_SEND_TECH, AUTO_KNIGHTS_ON_QUESTION, AUTONOMY_DIAL, KNIGHTS_STANDBY_MODE. Do NOT publish values if secret-adjacent or service configuration details are sensitive.
2. Identify any current intentionally unattended support response workflow that relies on the old default TRUE. Decide whether to leave it manual, or explicitly opt in to safe low-risk TEXT only after the action-level authorization review.
3. Confirm protected PR review for this sensitive workflow change (security issue #13). Treat CI on a branch modifying its own workflow as regression evidence, **not an independent security approval**.
4. Before production release: run ticket-level integration tests with real authorization context for TECH vs BILLING/BUILD, payroll, PII, core-path warnings and tenant boundary; test runtime kill switch while jobs are queued.
5. Review relay authentication, nonce/anti-replay, cron-vs-Render authority, runbook executor, metering hard stop, protected GitHub rulesets and independent evidence store (open P0s in #13).
6. Only after approval: canary in non-production, observe sends/denies and incident alerts, verify rollback, then owner-approved production rollout.

## Certified Autonomous conditions (separate from this patch)

Company OS cannot self-certify. Every capability receives a bounded certificate tied to release SHA, actor/service identity, authorized actions, tool version and tenant scope. Independent verifier checks source integrity, signed build, least privilege, audit receipts, adversarial prompt tests, credentials/secrets isolation, R&D spend limit, restore/rollback and emergency stop. Revoke certificate on relevant policy, model, tool, connector, permission or artifact changes.

## Not asserted

- No production flags were changed, no secrets were read, no migrations were run.
- No live security penetration test, agent sandbox or third-party certification was completed.
- CI passing does not prove an attacker cannot jailbreak the language model. Compromised model output must be denied by tool/IAM/deployment security controls outside the model.
