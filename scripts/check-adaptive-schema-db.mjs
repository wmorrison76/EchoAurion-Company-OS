/**
 * Disposable database smoke for a newly-added schema-only integration passport.
 * Executed in a transaction that is ALWAYS rolled back.
 * No live provider data, customer database, or credentials are used.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl || !databaseUrl.includes('127.0.0.1:5432/test')) {
  throw new Error('Disposable localhost test database required')
}

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
try {
  await client.query('BEGIN')
  const migration = await readFile(
    new URL('../prisma/migrations/20261010003500_incumbent_schema_observations/migration.sql', import.meta.url),
    'utf8',
  )
  await client.query(migration)
  const existing = await client.query(
    "SELECT to_regclass('public.incumbent_schema_observations') AS relation",
  )
  assert.equal(existing.rows[0].relation, 'incumbent_schema_observations')

  const row = await client.query(
    'INSERT INTO incumbent_schema_observations ' +
      '("id", "observationKey", "clientKey", "providerKey", "facilityKey", ' +
      '"adapterVersion", "schemaHash", "fieldCount", "fieldDescriptors") ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ' +
      'RETURNING "sourceVerified", "connectionVerifiedAt", "firstObservedAt", "lastObservedAt"',
    ['smoke-row-1', 'unique-observation-1', 'test-install', 'mews', 'test-facility',
      'sha-demo', 'schema-hash', 1, JSON.stringify([{ path: 'reservation.id', kind: 'string' }])],
  )
  assert.equal(row.rowCount, 1)
  assert.equal(row.rows[0].sourceVerified, false)
  assert.equal(row.rows[0].connectionVerifiedAt, null)
  assert.ok(row.rows[0].firstObservedAt)
  assert.ok(row.rows[0].lastObservedAt)

  await client.query('SAVEPOINT duplication')
  let duplicateRejected = false
  try {
    await client.query(
      'INSERT INTO incumbent_schema_observations ' +
        '("id", "observationKey", "clientKey", "providerKey", "facilityKey", ' +
        '"adapterVersion", "schemaHash", "fieldCount", "fieldDescriptors") ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
      ['smoke-row-2', 'unique-observation-1', 'test-install', 'mews', 'test-facility',
        'sha-demo', 'schema-hash', 1, '[]'],
    )
  } catch (error) {
    if (error?.code === '23505') duplicateRejected = true
    else throw error
  }
  await client.query('ROLLBACK TO SAVEPOINT duplication')
  assert.ok(duplicateRejected, 'observation fingerprint must be unique')
  const columns = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'incumbent_schema_observations'",
  )
  for (const name of ['apiVersion', 'schemaHash', 'firstObservedAt', 'lastObservedAt', 'fieldDescriptors']) {
    assert.ok(columns.rows.some(x => x.column_name === name), 'missing: ' + name)
  }
  console.log('PASS: isolated schema passport migration, defaults, unique constraint, and version fields')
} finally {
  await client.query('ROLLBACK').catch(() => {})
  await client.end()
}
