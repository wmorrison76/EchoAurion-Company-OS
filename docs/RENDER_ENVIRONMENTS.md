# Render environments — Production vs Super_Admin

**Audience:** William Morrison  
**Date:** 2026-07-13  
**Related:** `docs/RENDER_REGION_NOTES.md`, `docs/CRON_SECRET_SETUP.md`, `render.yaml`

---

## Plain English

Render **Production** and **Super_Admin** are **labels / folders** (environments or projects in the dashboard). They are **not** magic deploy modes. Nothing about the name “Production” makes a service more live than one sitting under “Super_Admin.”

What customers and pilots hit is whichever **web service URL** (and DNS) you point at — plus the env vars on that service. Folder name does not change region, secrets, or traffic.

---

## What you have today

| Folder / environment | What’s in it | Action |
|---|---|---|
| **Super_Admin** | Live Company OS: `echoaurion-company-os` (Oregon) + maintenance / sync / briefing crons | **Keep using this** |
| **Production** (Company OS side) | **0 services** (empty) | Ignore or delete later — do **not** create a duplicate Company OS stack here |
| luccca **Production** (Virginia) | Pilot / property website | Correct and separate — leave it alone |

**Keep Company OS in Super_Admin** where it already works. Moving into the empty Production folder is optional rename/reorganize only — not required for correctness.

Do **not** stand up a second Company OS web in empty Production. That would double cron targets, confuse `CRON_SECRET` / `NEXTAUTH_URL`, and risk split-brain.

---

## Flash — Failed run on every cron

All crons Failed + web Deployed almost always means **`CRON_SECRET` missing on each cron** (Env UI showing the key on web only is the usual trap). Paste the **identical** value on every cron. Details: `docs/CRON_SECRET_SETUP.md`.

## ops-poll placement

Blueprint (`render.yaml`) defines crons next to the web service, including:

1. `echoaurion-company-os-sync`
2. `echoaurion-company-os-briefing`
3. `echoaurion-company-os-maintenance`
4. `echoaurion-company-os-ops-poll` (every 5 min: CI/deploy failures → tickets + ingest drain)
5. `echoaurion-company-os-help-eval-friday` / `echoaurion-company-os-cost-anomaly` (optional)

If the Super_Admin list shows web + some crons and **ops-poll is missing**:

1. Search Render for `echoaurion-company-os-ops-poll` (it may live under another environment/workspace — e.g. an old luccca “Production” folder).
2. Prefer it living **next to** the other Company OS crons in **Super_Admin**, same Oregon region, same `CRON_SECRET` and `WEB_SERVICE_URL` → Company OS web.
3. If it does not exist anywhere: create from Blueprint / add the cron manually (see `docs/CRON_SECRET_SETUP.md`). Do **not** force-merge pilot PR #202 for this.
4. Without ops-poll, Knights stay “asleep” on SYSTEM errors — ingest `agent_loop` jobs never drain.

Region rule (unchanged): Company OS **web + all its crons + Neon** stay same-region. See `docs/RENDER_REGION_NOTES.md`.

---

## Optional later crons (same Super_Admin folder)

| Service name | Schedule | Path |
|---|---|---|
| `echoaurion-company-os-help-eval-friday` | `0 22 * * 4` (Thu 22:00 UTC) | `POST /api/ops/help-eval-friday` |
| `echoaurion-company-os-cost-anomaly` | `30 8 * * *` (after daily sync) | `POST /api/ops/cost-anomaly` |

Both use the **same** `CRON_SECRET` as web. Declared in `render.yaml`.

---

*Aurion Holdings, Inc. · EchoAurion Company OS*
