# Company OS / DrOS production dependency vulnerability baseline

Related to Certified Autonomous security gate #13.

The normal npm ci output reported **28 total advisories** in the full dependency tree at the last reviewed run (5 moderate, 18 high, 5 critical). The full-tree count includes dev dependencies and does **not** establish which are reachable in production.

The new read-only script uses npm audit --json --omit=dev against the committed package lock and reports affected production packages, severities, direct/transitive status, advisory IDs and available fix labels. It does not install packages, run lifecycle scripts, rewrite the lockfile or auto-upgrade. It fails closed if audit does not return parseable and complete JSON.

**This workflow is advisory INVENTORY ONLY; passing it is not Certified Autonomous.** After owner-reviewed triage, make a separate trusted launch gate enforce no unresolved reachable high/critical production vulnerabilities. The script supports --enforce after remediation.

## Required response

1. Map each advisory to exact package/lockfile versions and reachable imports/entrypoints; a raw severity count alone is not an exploit assessment.
2. Prioritize publicly reachable API, auth/session, React/Next rendering, agent runners, database and deployment paths.
3. Perform bounded compatible dependency upgrades in isolated reviewed PRs; avoid blind npm audit fix --force. Validate any package lifecycle scripts in isolated CI.
4. Run auth/tenant tests, full regression, staging canary, rollback and fresh security scanning.
5. Make scan results and rulesets independently controlled; an agent must not edit its own required gate and then self-approve.
6. Re-scan on dependency changes, release, or newly disclosed critical advisories; document time-limited independent owner exception decisions when needed.

No packages, deployed services, customer secrets or production accounting were modified in this draft.