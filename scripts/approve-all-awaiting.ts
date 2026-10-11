/**
 * Read-only preview of Help Desk tickets awaiting approval.\n * Live approvals require an authenticated founder session through the HTTP route.
 *
 * Uses the same path as POST /api/help-desk/tickets/[id]/approve (relay + audit + echo_repair_ready).
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx ts-node --esm scripts/approve-all-awaiting.ts
 *   DATABASE_URL=postgres://... npx ts-node --esm scripts/approve-all-awaiting.ts --dry-run
 *
 * On Render shell (DATABASE_URL already set):
 *   npx ts-node --esm scripts/approve-all-awaiting.ts
 *
 * Or via cron HTTP (no DB shell needed):
 *   node scripts/cron-http-post.mjs /api/ops/approve-all-awaiting
 */

async function main() {
  // Direct database scripts have no authenticated founder principal. Fail closed.\n  if (process.argv.some(arg => ['--execute', '--live', '--approve', '--send'].includes(arg))) {\n    console.error('[approve-all] Live approval from CLI is prohibited; use the authenticated administrator route.')\n    process.exit(1)\n  }\n  const dryRun = true

  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      '[approve-all] DATABASE_URL is not set. Paste from Render → echoaurion-company-os → Environment.'
    )
    console.error(
      '[approve-all] Or POST /api/ops/approve-all-awaiting with CRON_SECRET on the web service.'
    )
    process.exit(1)
  }

  const { approveAllAwaitingApproval } = await import('../src/lib/help-desk-approve.js')

  console.log(`[approve-all] Scanning AWAITING_APPROVAL tickets${dryRun ? ' (dry run)' : ''}…`)

  const result = await approveAllAwaitingApproval({
    actor: 'william_morrison',
    dryRun,
  })

  console.log(
    `[approve-all] Done — approved: ${result.approved}, skipped: ${result.skipped}, failed: ${result.failed}`
  )

  for (const row of result.results) {
    const tag =
      row.outcome === 'approved' ? 'OK' : row.outcome === 'skipped' ? 'SKIP' : 'FAIL'
    const err = row.error ? ` — ${row.error}` : ''
    console.log(`  [${tag}] ${row.ticketId.slice(0, 12)}… ${row.subject.slice(0, 80)}${err}`)
  }

  process.exit(result.failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('[approve-all] Fatal:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
