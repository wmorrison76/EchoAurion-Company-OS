/**
 * Local / CI stub scanner — walks src/ and prints path findings.
 *
 *   npx tsx scripts/scan-stubs.ts
 *   npx tsx scripts/scan-stubs.ts --ingest   # POST /api/ops/stub-scan (needs CRON_SECRET)
 *
 * Daily production hook is desk-moles cron (includes this scan).
 * See docs/STUB_FILE_SCANNER.md
 */

import { scanCompanyOsSrc, formatStubScanCli } from '../src/lib/stub-scanner'

async function maybeIngest() {
  const wantIngest = process.argv.includes('--ingest')
  if (!wantIngest) return
  const base = (
    process.env.WEB_SERVICE_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    console.error('[scan-stubs] --ingest needs CRON_SECRET. Presence only logged.')
    process.exit(1)
  }
  const url = `${base}/api/ops/stub-scan`
  console.log(`[scan-stubs] POST ${url}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json',
    },
  })
  const text = await res.text()
  console.log(`[scan-stubs] HTTP ${res.status} ${text.slice(0, 400)}`)
  if (!res.ok) process.exit(1)
}

const scan = scanCompanyOsSrc()
console.log(formatStubScanCli(scan))
void maybeIngest()
