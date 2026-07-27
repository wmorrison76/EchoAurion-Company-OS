# Pilot PR #202 — Safe rebase notes (no force-merge)

**PR:** https://github.com/wmorrison76/Echo_Aurion-LUCCCA_Framework/pull/202  
**Branch:** `claude/laughing-noether-lSZwe`  
**Title:** PR-P6: Admin User Console — rewire Ecosystem Panel > Users to real backend  
**State (2026-07-12):** OPEN · **mergeable: CONFLICTING** vs `main`  
**Approx. delta:** ~795 commits ahead of `main` (large branch) · do **not** force-merge.

---

## Goal

Land Admin User Console backend rewire without destroying `main` history. Prefer a **dedicated conflict session** with incremental conflict resolution — never `--force` to `main`.

---

## Recommended approach

1. **Update branch tip** (already ff-only safe):
   ```bash
   git checkout claude/laughing-noether-lSZwe
   git pull --ff-only origin claude/laughing-noether-lSZwe
   ```
2. **Create a rebase/merge work branch** (do not push force):
   ```bash
   git fetch origin main
   git checkout -b wip/pr-202-rebase-$(date +%Y%m%d)
   git merge origin/main   # OR: git rebase origin/main on a throwaway clone
   ```
3. Resolve conflicts file-by-file; commit resolution chunks; open a **follow-up PR** or update #202 only after green CI.
4. If rebase gets messy: abort (`git merge --abort` / `git rebase --abort`) and retry with smaller file batches. **Never** `git push --force` to `main` or shared protected branches.

---

## High-conflict hotspots (changed in both)

Treat these as **manual merge** — prefer `main` for unrelated product drift; prefer PR branch for User Console / auth wiring:

| Area | Paths |
|---|---|
| Env | `.env.example` |
| Backend entry | `backend/server.py`, `backend/routes/echo_momentum.py`, `cake_consultation.py`, `gallery_iter244.py` |
| Shell / chrome | `client/AppFull.tsx`, `client/components/site/{Sidebar,Toolbar,UserAvatarMenu}.tsx`, `MinimizedPanels.tsx`, `Notifications.tsx`, `EchoCommandBar.tsx` |
| Panels | `client/lib/panel-{registry,metadata,types}.ts`, `brand-icon-registry.ts` |
| i18n | `client/i18n/translations/*.json` (many locales — often take both keys) |
| Modules | Chronos, Commissary, Culinary, EchoActivityDrawer, EntremetBuilder, Mixology*, Pastry* |
| Server | `server/index.ts`, `server/routes/*`, `server/lib/echo/providers`, sanitize-api-keys |
| Lockfiles | `package.json`, `pnpm-lock.yaml`, `render.yaml` |

---

## Suggested resolution order

1. `package.json` / lockfile (regen lock once deps settled)  
2. `server/index.ts` + auth/user routes (core of this PR)  
3. Panel registry / Sidebar / Toolbar (wiring Users panel)  
4. i18n (union of keys)  
5. Unrelated module conflicts — prefer `main` unless PR intentionally touched them  
6. `render.yaml` / `.env.example` — union required env vars  

---

## Explicitly forbidden

- Force-merge of #202 into `main`  
- `git push --force` to `main` / `master`  
- Squashing away conflict markers without reading both sides  

---

## After green

- Confirm User Management panel hits real backend  
- Smoke: login → Ecosystem → Users → list/create/role  
- Close conflict session notes in PR body  

*Aurion Holdings · EchoAurion · support 90-day sprint companion*
