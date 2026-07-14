# Dr. OS Constitution

Runtime encoding: `src/lib/constitution.ts` (version `1.1.0`).

This is the non-negotiable operating charter for autonomous Help Desk, Knights standby, safe tools, and Architect build pipelines on **Company OS**. Product (LUCCCA) never inherits these agents unchecked.

## Rules

| ID | Rule | Meaning |
|---|---|---|
| `no_pii` | No guest PII | Never log/store guest identity, cards, room numbers in tickets, outbox, or Knowledge Plane. |
| `no_prod_write_without_gates` | No prod write without gates | Quote → agreement → billing authorize → William execute + `rollbackRef`. |
| `pr_only_code` | PR-only code | Architect produces draft plan / draft GitHub PR. **Merge is human/CI.** GLOBAL error fixes = draft PR only. |
| `audit_actors` | Audit actors | Every mutation: `william_morrison` \| `computer_agent` + payload snapshot. |
| `dual_control_paid` | Dual control for paid | EXEC/ADMIN/DIRECTOR profile agreement + billing contact. |
| `rollback_required` | Rollback required | Execute blocked without `rollbackRef`. |
| `no_remote_desktop` | No remote desktop | Safe tools / break-glass never open RDP or TeamViewer. |
| `autopilot_limits` | Autopilot limits | Autopilot may auto-answer low-risk TEXT and emit stub directives — **never** merge, paid execute, or T3+ auto-approve. |
| `no_core_self_harm` | No core self-harm | Knights/Architect must **not** auto-modify auth, middleware, relay secrets, billing, or destructive prisma. Deny-list → `NEEDS_HUMAN_CORE_REVIEW` + dual human control. Never auto-execute schema drops / secret rotation / auth removal. |

**Payroll / compensation (Help Desk):** Hard refuse in `src/lib/payroll-refuse.ts` — Knights have no product RBAC and no payroll DB. Salary / “how much is X making” never gets an inventing draft; standby never auto-sends. William may reply manually only after verifying in-product authorization.

## Core-path deny-list (hallucination guard)

See `src/lib/core-path-guard.ts`. Hits force `AWAITING_APPROVAL` + `needsHumanCoreReview` and **block standby auto-approve**.

- `src/lib/auth`, `middleware`, `src/lib/relay-auth`, constitution
- Secrets / `.env` / ingest tokens
- Destructive migrate (`DROP`, `migrate reset`)
- Force-push

## Autonomy dial ↔ constitution

| Dial | May do | May not |
|---|---|---|
| `assist` | Draft answers/plans; dry-run tools | Auto-answer, execute tools, paid, merge |
| `standby` | Auto-answer low-risk TEXT; execute soft outbox tools | Paid execute, merge, T3+ auto, RDP, core-path writes |
| `autopilot` | Same as standby + more stub directives | Merge, paid execute, T3+ auto, RDP, core-path writes |

## Super Admin

Canonical test identity: **`william@echoaurion.com`** (`ADMIN_EMAIL`). Session role is `dr_os` (Dr. OS). For paid-via-profile lab gates, that email is treated as **EXEC**.

## Related

- `docs/ERROR_CAPTURE_AND_SCOPE.md` — ZARO lineage, taxonomy, notify-when-fixed
- `docs/ELITE_DR_OS.md` — architecture
- `docs/PR_FROM_BUILD.md` — Architect PR-only pipeline
- `docs/HELP_EVAL.md` — evaluation harness
- `docs/PAID_VIA_PROFILE.md` — agreement gate
