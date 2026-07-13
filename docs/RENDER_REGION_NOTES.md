# Render region notes — Oregon vs Virginia

**Audience:** William Morrison  
**Date:** 2026-07-13  
**Question:** luccca-web is Virginia; Company OS web + crons are Oregon. Should Company OS move?

---

## What the repo documents

| Fact | Source |
|---|---|
| `render.yaml` does **not** pin a region | Blueprint has no `region:` field — region is chosen in the Render dashboard at create time |
| Neon region is **not** encoded in env templates | `DATABASE_URL` / `DATABASE_URL_UNPOOLED` are `sync: false` secrets |
| Cross-region Neon ↔ Render is OK for v1 | `DEPLOY.md`: Neon `us-east-1` with Render Oregon is fine; same-region is optional polish |

Confirm Neon’s actual region in the Neon console (project settings). Do not guess from Render’s Oregon badge alone.

---

## Latency: when VA ↔ OR matters

Help Desk / relay is luccca (Virginia) → HTTPS → Company OS (Oregon) → Neon (wherever it lives).

| Call path | Typical cost | When it hurts |
|---|---|---|
| Property UI → Company OS ingest / whoami | One extra ~40–80 ms RTT vs same-region | Rarely noticeable for ticket create / heartbeat |
| Company OS → Neon (if Neon is VA and web is OR) | Every DB query pays cross-region | Dashboard panels, ticket list, Knights drafts |
| Cron → Company OS web | Same-region today (both OR) — keep it that way | Ops-poll every 5 min; do not put cron in VA while web is OR |

**Bottom line:** Same-region helps DB chatter more than pilot→Company OS relay. Relay cross-coast is acceptable unless William measures real floor-manager lag.

---

## Do not casually “re-scoop” to Virginia

Render does **not** move a live service’s region in place. Practical cutover:

1. Create a **new** web service in Virginia (or clone Blueprint into VA).
2. Copy **all** env vars (including `CRON_SECRET`, `SUPPORT_INGEST_SECRET`, DB URLs, Auth).
3. Point custom domain / `NEXTAUTH_URL` at the new host.
4. Recreate or retarget **all** Company OS crons so `WEB_SERVICE_URL` hits the new web URL.
5. Cut DNS / deactivate Oregon web after health checks.
6. Expect a short dual-run window and downtime risk if DNS/auth flip mid-session.

**Hard rule:** Keep **Company OS web + all its crons + Neon** in the **same** region as each other. Moving web alone away from Neon is worse than leaving Oregon while the pilot stays Virginia.

`echoaurion-company-os-ops-poll` living in a luccca “Production” *workspace* is organizational only. Its **region** should still match Company OS web + DB.

---

## Recommendation

**Stay Oregon** unless:

- Neon is already Virginia **and** Dr. OS / Help Desk feel slow from DB RTT, or
- There is a real compliance / data-residency requirement to co-locate with luccca.

If William insists on Virginia later: migrate as a checklist (new VA web → copy env → update domain + cron `WEB_SERVICE_URL` → optionally move Neon to VA first or at the same time → cutover). Do not move web without DB planning.

---

*Aurion Holdings, Inc. · EchoAurion Company OS*
