#!/usr/bin/env node
// prisma-repair.mjs
//
// Incident-specific repair for known-safe migrations before `prisma migrate deploy`:
//   1) Mark abandoned failed rows as rolled back so deploy can re-apply idempotent SQL.
//   2) Realign stored checksums when an allowlisted migration finished under the
//      pre-rewrite file (avoids Prisma "modified after it was applied").
//
// Safety:
//   1) Only allowlisted migrations (on-disk SQL rewritten with IF NOT EXISTS).
//   2) Only failed rows with started_at older than STALE_MS (skips in-flight applies).
//   3) Never marks successful rows as rolled back — only updates mismatched checksums.
//   4) No-op when nothing matches.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pgPkg from 'pg'
const { Client } = pgPkg

/** Migrations whose on-disk SQL is known idempotent / safe to re-run. */
const REPAIRABLE_MIGRATIONS = ['20260723160000_self_healing_p1']

/** Ignore "failed" rows newer than this — they may still be applying. */
const STALE_MS = 15 * 60 * 1000

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations')

function checksumFor(migrationName) {
  const sql = readFileSync(join(migrationsDir, migrationName, 'migration.sql'))
  return createHash('sha256').update(sql).digest('hex')
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[prisma-repair] DATABASE_URL not set — skipping')
  process.exit(0)
}

const client = new Client({ connectionString: url })

try {
  await client.connect()

  const staleBefore = new Date(Date.now() - STALE_MS)

  const { rows: failed } = await client.query(
    `
    SELECT migration_name
    FROM _prisma_migrations
    WHERE finished_at IS NULL
      AND rolled_back_at IS NULL
      AND started_at IS NOT NULL
      AND started_at < $1
      AND migration_name = ANY($2::text[])
  `,
    [staleBefore, REPAIRABLE_MIGRATIONS]
  )

  for (const { migration_name } of failed) {
    console.log(`[prisma-repair] marking failed migration as rolled back: ${migration_name}`)
    await client.query(
      `UPDATE _prisma_migrations
         SET rolled_back_at = NOW()
       WHERE migration_name = $1
         AND finished_at IS NULL
         AND rolled_back_at IS NULL
         AND started_at < $2`,
      [migration_name, staleBefore]
    )
  }

  let checksumFixed = 0
  for (const migrationName of REPAIRABLE_MIGRATIONS) {
    let expected
    try {
      expected = checksumFor(migrationName)
    } catch (err) {
      console.error(`[prisma-repair] cannot read ${migrationName}:`, err?.message || err)
      continue
    }

    const result = await client.query(
      `
      UPDATE _prisma_migrations
         SET checksum = $1
       WHERE migration_name = $2
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL
         AND checksum <> $1
    `,
      [expected, migrationName]
    )
    if ((result.rowCount ?? 0) > 0) {
      checksumFixed += result.rowCount
      console.log(`[prisma-repair] realigned checksum for applied migration: ${migrationName}`)
    }
  }

  if (failed.length === 0 && checksumFixed === 0) {
    console.log('[prisma-repair] nothing to do')
  } else {
    console.log(
      `[prisma-repair] resolved ${failed.length} failed migration(s), realigned ${checksumFixed} checksum(s)`
    )
  }
} catch (err) {
  console.error('[prisma-repair] error:', err?.message || err)
  // Don't hard-fail the deploy on repair errors — let prisma migrate deploy
  // report the real problem itself.
  process.exit(0)
} finally {
  try {
    await client.end()
  } catch {}
}
