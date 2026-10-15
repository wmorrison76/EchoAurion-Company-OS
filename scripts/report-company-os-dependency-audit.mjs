/**
 * Read-only NPM dependency advisory inventory for Company OS control plane.
 * Does not install packages, execute lifecycle scripts, mutate lockfiles,
 * auto-fix, or touch credentials. Runs against the committed lockfile.
 */
import { spawnSync } from 'node:child_process'

const args = ['audit', '--json', '--omit=dev']
const child = spawnSync('npm', args, {
  encoding: 'utf8',
  timeout: 120_000,
  maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, npm_config_audit: 'true' },
})

if (child.error) throw child.error
// npm audit returns 1 when vulnerabilities are present; any other nonzero
// status or signal means the inventory cannot be trusted as complete.
if (child.signal || (child.status !== 0 && child.status !== 1)) {
  console.error('SECURITY_AUDIT_UNAVAILABLE: npm audit process failed unexpectedly.')
  process.exit(2)
}
let report
try {
  report = JSON.parse(child.stdout)
} catch {
  console.error('SECURITY_AUDIT_UNAVAILABLE: npm audit did not return valid JSON.')
  process.exit(2)
}
if (!report || typeof report !== 'object' ||
    !report.metadata?.vulnerabilities || typeof report.vulnerabilities !== 'object') {
  console.error('SECURITY_AUDIT_UNAVAILABLE: incomplete NPM advisory response.')
  process.exit(2)
}

const risks = Object.entries(report.vulnerabilities).map(([name, entry]) => {
  const severity = String(entry.severity ?? 'unknown')
  const fix = entry.fixAvailable === false ? 'no-known-fix'
    : entry.fixAvailable === true ? 'potential-fix'
    : entry.fixAvailable?.name ? 'upgrade-needed:' + entry.fixAvailable.name
    : 'review-needed'
  const via = Array.isArray(entry.via)
    ? entry.via.filter(x => typeof x === 'object').map(x => x.source).filter(Boolean)
    : []
  return {
    name,
    severity,
    direct: Boolean(entry.isDirect),
    fix,
    via: via.slice(0, 8),
    range: String(entry.range ?? ''),
  }
})
const rank = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 }
risks.sort((a, b) => (rank[a.severity] ?? 5) - (rank[b.severity] ?? 5)
  || a.name.localeCompare(b.name))
const counts = report.metadata.vulnerabilities
const total = Number(counts.total)
if (!Number.isSafeInteger(total) || total < 0) {
  console.error('SECURITY_AUDIT_UNAVAILABLE: invalid NPM vulnerability total.')
  process.exit(2)
}

console.log('COMPANY_OS_PRODUCTION_DEPENDENCY_ADVISORIES')
console.log('Counts (npm audit --omit=dev):', JSON.stringify(counts))
console.log('Affected package count:', risks.length)
for (const item of risks) {
  // Names, severity and advisory IDs only. No environment values or tokens.
  console.log(JSON.stringify(item))
}
console.log('SECURITY_REVIEW_REQUIRED:', total > 0)
console.log('Baseline only; audit counts do NOT establish runtime exploitability or certification.')

if (process.argv.includes('--enforce')) {
  const blocking = risks.filter(r => r.severity === 'critical' || r.severity === 'high')
  if (blocking.length) {
    console.error('POLICY_GATE_FAILED: high or critical production dependency advisories.')
    process.exit(1)
  }
}
