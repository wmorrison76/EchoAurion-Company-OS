# Database Restore Runbook

**Status:** Live procedure for the Render + Neon production stack.
**Snapshot sources:** nightly `backup-YYYY-MM-DD-HHmm` Neon branches
(`scripts/cron-db-backup.mjs`, cron `echoaurion-company-os-db-backup`, 07:30 UTC,
30-day retention) and per-deploy `predeploy-YYYY-MM-DD-HHmm` branches
(`scripts/predeploy-snapshot.mjs`, 7-day retention).

## When to use which snapshot

| Situation | Snapshot |
|---|---|
| Bad migration just deployed | Latest `predeploy-*` (moments before the migration) |
| Data corruption noticed today | Latest `backup-*` before the corruption window |
| Need a point between snapshots | Neon point-in-time restore (history window), console → Branches → "Restore" |

## Restore procedure (Neon branch → production)

> Total time ≈ 10 minutes. Nothing here deletes the damaged state — the old
> primary branch is preserved for forensics. Archive, never delete.

1. **Freeze writes.** Render dashboard → `echoaurion-company-os` (web) →
   Suspend. Crons can stay; they fail cleanly against a suspended web service.
2. **Pick the snapshot.** Neon console → project → Branches. Verify the
   timestamp is before the incident. For finer granularity use Neon's
   time-travel restore on the primary branch instead of a snapshot branch.
3. **Promote.** Two options:
   - *Option A (branch swap, preferred):* Create a new branch from the snapshot
     branch named `main-restored-<date>`, add a compute endpoint to it, and
     copy its connection string.
   - *Option B (in-place):* Neon console → primary branch → Restore →
     "from branch" → select the snapshot. Neon keeps a `_old` backup branch
     automatically.
4. **Repoint the app (Option A only).** Render → web service → Environment →
   update `DATABASE_URL` (+ `DATABASE_URL_UNPOOLED`) to the restored branch's
   pooled/unpooled strings.
5. **Migration check.** If restoring to before a bad migration, ensure the bad
   migration file is removed/fixed on the deploy branch BEFORE resuming, or
   `prisma migrate deploy` will re-apply it on startup.
6. **Resume.** Render → Resume web service. Watch `/api/health` and the deploy
   logs (`predeploy-snapshot` will cut a fresh rollback point on boot).
7. **Verify.** Log in, open Help Desk + Financial overview, run
   `POST /api/ops/drain-queue` with CRON_SECRET to confirm queue integrity.
8. **Document.** File a SYSTEM ticket ("restore performed: <snapshot name>,
   reason, data window lost if any") so the ticket system holds the record.

## Weekly restore verification (do not skip)

A backup that has never been restored is a hope, not a backup. Once a week:
create a branch from the latest `backup-*`, attach a compute endpoint, run
`npx prisma migrate status` and a row-count spot check against production
(`HelpTicket`, `AuditLog`, `PlaidTransaction`), then delete the test branch.
Log the result in a ticket. (Candidate for automation as
`scripts/cron-restore-verify.mjs` — P1.)

## Configuration

- `NEON_API_KEY` — Neon console → Account → API keys (scope to the project).
- `NEON_PROJECT_ID` — Neon console → Project settings → General.
- Set both on the web service AND the `-db-backup` cron.
- Neon history retention: set to ≥ 7 days (console → Project settings →
  Storage) so point-in-time restore covers the gap between nightly snapshots.
