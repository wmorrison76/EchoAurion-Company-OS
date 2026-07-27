# Elite Dr. OS — Autonomous Help Desk Architecture

Company OS north star for Super Admin **`william@echoaurion.com`** (Dr. OS / EXEC paid gates).

## Layers

| Layer | Path | Role |
|---|---|---|
| Constitution | `src/lib/constitution.ts`, `docs/CONSTITUTION.md` | Hard rules: no PII, PR-only code, dual control, rollback, no RDP |
| Autonomy dial | `src/lib/autonomy.ts` | `assist` \| `standby` \| `autopilot` → maps to Knights standby |
| Safe toolbelt | `src/lib/safe-tools.ts`, `POST /api/tools/invoke` | Allowlisted directives; dry-run default |
| Architect PR | `src/lib/pr-from-build.ts`, `POST /api/work/[id]/pr-plan` | Draft plan + optional GitHub **draft** PR |
| Eval harness | `src/lib/help-eval.ts`, `POST /api/help-desk/eval/run` | ~18 classifier cases |
| Break-glass | `src/lib/break-glass.ts` | Scaffold only — **NOT TeamViewer** |
| Timeline | `HelpTimelineEvent` | Customer-visible ticket stages |
| Spend cap | `BUILD_SPEND_CAP_USD` (default 5000) | Warn/block quotes over remaining monthly budget |

## Autonomy rules

| Dial | Auto TEXT | Soft tools execute | Merge PR | Paid execute | T3+ auto |
|---|---|---|---|---|---|
| `assist` | no | dry-run only | never | never | never |
| `standby` | yes (low-risk) | yes (outbox) | never | never | never |
| `autopilot` | yes | yes (stubs) | never | never | never |

## How William tests

1. Login as `ADMIN_EMAIL` = `william@echoaurion.com`
2. Open **`/lab/elite`** — run checklist (health, email, autonomy, tech, build, authorize, tool dry-run, eval)
3. Open **`/lab/echo-chrome`** — mock product chrome (help + profile EXEC)
4. Confirm tickets in **`/help-desk`** — timeline + toolbelt + Open PR plan on FEATURE
5. Flip dial on **`/support/pilot-links`**

## Phase 2 (not this ship)

- Real Twilio voice/SMS
- Real RDP / Capactor remote (break-glass is placeholder)
- Capactor App Store
- Live LUCCCA sidebar chrome (pilot wiring branch only for contracts)

## Related docs

- `docs/CONSTITUTION.md`
- `docs/PR_FROM_BUILD.md`
- `docs/HELP_EVAL.md`
- `docs/PAID_VIA_PROFILE.md`
- `docs/PILOT_CONNECTION.md`
