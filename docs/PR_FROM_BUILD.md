# PR from Build — Architect PR-only pipeline

When FEATURE / Build work is on the approved path, Company OS produces a **draft PR plan** — never a merge.

## Flow

1. WorkRequest exists (Help Desk FEATURE or relay ingest)
2. Knights `draftPlan` (or operator asks Knights)
3. Operator clicks **Open PR plan** (Help Desk toolbelt or `POST /api/work/:id/pr-plan`)
4. System stores structured plan on `WorkRequest.context.prPlan`:
   - `branchName`, `prTitle`, `prBody`, `fileTouchList`
5. If `GITHUB_TOKEN` + repo configured → optional **GitHub draft PR** (`draft: true`)
6. **Human / CI merges** — agents and autopilot are constitutionally blocked from merge

## API

```http
POST /api/work/{id}/pr-plan
Authorization: session (dr_os)
```

Response:

```json
{
  "success": true,
  "data": {
    "plan": { "branchName": "build/…", "prTitle": "[Build] …", "fileTouchList": [], "mergeForbidden": true },
    "github": { "created": false, "detail": "GITHUB_TOKEN not set — plan stored only" }
  }
}
```

Safe tool equivalent: `open_pr` via `POST /api/tools/invoke`.

## Env

| Var | Purpose |
|---|---|
| `GITHUB_TOKEN` | Create draft PRs (needs `repo` / pull scope) |
| `GITHUB_ORG` | Default `wmorrison76` |
| `GITHUB_BUILD_REPO` | Override `org/repo` |
| `GITHUB_BUILD_BASE` | Base branch (default `main`) |

## Constitution

- `pr_only_code` — draft only
- `merge_pr` — always blocked for agents
- Property execute still requires dual control + `rollbackRef` (see `docs/PAID_VIA_PROFILE.md`)
