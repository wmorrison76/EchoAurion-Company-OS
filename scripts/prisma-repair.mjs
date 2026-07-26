#!/usr/bin/env node
// prisma-repair.mjs
//
// Marks any migration in the `_prisma_migrations` table that is in a "failed"
// state (rolled_back_at IS NULL AND finished_at IS NULL AND started_at IS NOT NULL)
// as rolled back, so `prisma migrate deploy` can re-apply the (now idempotent)
// version.
//
// This is safe because:
//   1) The corresponding migration.sql has been rewritten with IF NOT EXISTS.
//   2) We only touch rows Prisma itself considers failed — never successful ones.
//   3) The command is a no-op if there are no failed rows.
//
// Run before `prisma migrate deploy`.

import { execSync } from 'node:child_process'
import pgPkg from 'pg'
const { Client } = pgPkg

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[prisma-repair] DATABASE_URL not set — skipping')
  process.exit(0)
}

const client = new Client({ connectionString: url })

try {
  await client.connect()

  const { rows } = await client.query(`
    SELECT migration_name
    FROM _prisma_migrations
    WHERE finished_at IS NULL
      AND rolled_back_at IS NULL
      AND started_at IS NOT NULL
  `)

  if (rows.length === 0) {
    console.log('[prisma-repair] no failed migrations — nothing to do')
    process.exit(0)
  }

  for (const { migration_name } of rows) {
    console.log(`[prisma-repair] marking failed migration as rolled back: ${migration_name}`)
    await client.query(
      `UPDATE _prisma_migrations
         SET rolled_back_at = NOW()
       WHERE migration_name = $1
         AND finished_at IS NULL
         AND rolled_back_at IS NULL`,
      [migration_name]
    )
  }

  console.log(`[prisma-repair] resolved ${rows.length} failed migration(s)`)
} catch (err) {
  console.error('[prisma-repair] error:', err?.message || err)
  // Don't hard-fail the deploy on repair errors — let prisma migrate deploy
  // report the real problem itself.
  process.exit(0)
} finally {
  try { await client.end() } catch {}
}
