# Stub / dead-end file scanner

**Audience:** William Morrison + engineering  
**Status:** Wired in Company OS (2026-08-20)  
**Job:** Walk `src/` for unfinished strings and known scaffolds, then file a Help Desk SYSTEM TECH ticket **with file paths**. Report only — never auto-merge.

This closes the gap William hit: moles ingested opinions, but nothing grepped the tree.

---

## What it hunts

| Rule | Example | Shape |
|---|---|---|
| `coming_soon` | Coming Soon / coming soon | ✕ |
| `todo_claude` | `TODO(claude)` | ▲ |
| `not_implemented` | not implemented | ▲ |
| `stub_word` | stub / stubs (word) | ▲ |
| `not_deployed` | Not deployed | ▲ |
| `greyed` | greyed / grayed-out | ▲ |
| `placeholder_deadend` | “placeholder page” (not `placeholder=` form attrs) | ▲ |
| `known_scaffold` | IVR, SMS, Railway, break-glass, Gmail hook, AurionIndex | ▲ |

Colorblind-safe: every finding is **shape + label + path**. Counts are numbers, never color alone.

The UX mole **must not** say “No Coming Soon strings” unless this walk returned 0 hits.

---

## How to run

### Local (no ticket)

```bash
npm run scan:stubs
```

Prints `✓ / ▲ / ✕` lines with `path:line · rule`.

### On-demand ticket (session or cron)

```bash
# Dry-run
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://echoaurion-company-os.onrender.com/api/ops/stub-scan?dryRun=1"

# File / update today's ticket
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://echoaurion-company-os.onrender.com/api/ops/stub-scan
```

Or from a logged-in Dr. OS session: `POST /api/ops/desk-moles-run` (includes this scan) or `POST /api/ops/stub-scan`.

### Daily cron (already in render.yaml)

`echoaurion-company-os-desk-moles` at **11:00 UTC** → `POST /api/ops/desk-moles-run`.

That report now includes a **Stub / dead-end file scan** category with paths. No extra cron was added (avoids another `CRON_SECRET` paste). Same secret as other crons — see `docs/CRON_SECRET_SETUP.md`.

Optional CLI ingest:

```bash
CRON_SECRET=… WEB_SERVICE_URL=https://echoaurion-company-os.onrender.com \
  npx tsx scripts/scan-stubs.ts --ingest
```

---

## How tickets get filed

1. Scanner walks `src/` on the web service (Render checkout still has `src/`).
2. Builds a `NightCleanerReport` (`schemaVersion: 1`).
3. `ingestNightCleanerReport` creates or updates a SYSTEM TECH ticket.
4. **Dedup:** fingerprint is `stub-scan|company-os|{YYYY-MM-DD}` (or the desk-moles day fingerprint when filed via desk-moles). Same path is not a new ticket on the same UTC day — occurrence count increments.
5. Ticket body lists `path:line · rule` with ✓ / ▲ / ✕. Audit: `ops.stub_scan.run` or `ops.desk_moles.run`.
6. Knights are **not** started. William triages.

If `src/` is missing on disk, the report is `? Scanner skipped` — it never claims the tree is clean.

---

## Related

- `src/lib/stub-scanner.ts`
- `POST /api/ops/stub-scan`
- `POST /api/ops/desk-moles-run`
- `docs/NIGHT_CLEANER_MOLE.md` (pilot floor walk still unwired)
