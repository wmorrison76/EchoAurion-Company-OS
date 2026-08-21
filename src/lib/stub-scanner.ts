/**
 * Walk Company OS src/ for stub / dead-end strings and known scaffold paths.
 * Report only — never auto-fix. Colorblind-safe: counts + shape + label.
 * See docs/STUB_FILE_SCANNER.md
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join, relative } from 'path'
import { randomUUID } from 'crypto'
import {
  NIGHT_CLEANER_SCHEMA_VERSION,
  statusToMorningLabel,
  statusToShape,
  type NightCleanerCategoryId,
  type NightCleanerFinding,
  type NightCleanerReport,
  type NightCleanerStatus,
  type NightCleanerTask,
} from '@/types/night-cleaner'

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.git'])
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

/** Scanner + tests + CLI mention the hunt phrases — do not file tickets on themselves. */
const EXCLUDE_REL = new Set([
  'src/lib/stub-scanner.ts',
  'src/lib/stub-scanner.test.ts',
  'src/lib/desk-moles/run.ts',
  'src/app/api/ops/stub-scan/route.ts',
  'scripts/scan-stubs.ts',
])

const IGNORE_LINE = 'stub-scan-ignore'

export type StubScanRuleId =
  | 'todo_claude'
  | 'coming_soon'
  | 'not_implemented'
  | 'greyed'
  | 'not_deployed'
  | 'stub_word'
  | 'placeholder_deadend'
  | 'known_scaffold'

export type StubScanHit = {
  path: string
  line: number
  rule: StubScanRuleId
  snippet: string
  status: NightCleanerStatus
  category: NightCleanerCategoryId
}

export type StubScanResult = {
  root: string | null
  filesScanned: number
  hits: StubScanHit[]
  counts: Record<StubScanRuleId, number>
  skipped: boolean
  skipReason?: string
}

type Rule = {
  id: StubScanRuleId
  re: RegExp
  status: NightCleanerStatus
  category: NightCleanerCategoryId
}

const LINE_RULES: Rule[] = [
  {
    id: 'todo_claude',
    re: /TODO\(claude\)/i,
    status: 'warn',
    category: 'stubs_placeholders',
  },
  {
    id: 'coming_soon',
    re: /coming\s*soon/i,
    status: 'error',
    category: 'stubs_placeholders',
  },
  {
    id: 'not_implemented',
    re: /not\s+implemented/i,
    status: 'warn',
    category: 'stubs_placeholders',
  },
  {
    id: 'greyed',
    re: /greyed|grayed[\s-]?out/i,
    status: 'warn',
    category: 'underbuilt_pages',
  },
  {
    id: 'not_deployed',
    re: /\bnot deployed\b/i,
    status: 'warn',
    category: 'underbuilt_pages',
  },
  {
    id: 'placeholder_deadend',
    re: /\b(placeholder page|placeholder panel|this is a placeholder|placeholder implementation)\b/i,
    status: 'warn',
    category: 'stubs_placeholders',
  },
  {
    id: 'stub_word',
    re: /\bstub(?:s|bed|bing)?\b/i,
    status: 'warn',
    category: 'stubs_placeholders',
  },
]

/** Always report these paths if they exist — IVR / SMS / Railway / Gmail / break-glass. */
const KNOWN_SCAFFOLDS: { rel: string; label: string }[] = [
  {
    rel: 'src/app/api/webhooks/support-ivr/route.ts',
    label: 'Twilio IVR webhook — coded, no live number',
  },
  {
    rel: 'src/app/api/webhooks/support-sms/route.ts',
    label: 'SMS intake — env-gated, not a live number',
  },
  {
    rel: 'src/app/api/webhooks/railway/route.ts',
    label: 'Railway failure ingest — scaffold, Render is production',
  },
  {
    rel: 'src/app/api/help-desk/break-glass/route.ts',
    label: 'Break-glass — scaffold, not a live remote tool',
  },
  {
    rel: 'src/app/api/crm/outreach/route.ts',
    label: 'CRM Gmail readonly — TODO(claude) hook only',
  },
  {
    rel: 'src/app/aurion-index/page.tsx',
    label: 'AurionIndex — static checklist, badge Not deployed',
  },
]

export function resolveSrcRoot(cwd = process.cwd()): string | null {
  const candidates = [join(cwd, 'src'), join(cwd, '..', 'src')]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

function walkFiles(dir: string, acc: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walkFiles(full, acc)
    } else if (st.isFile() && SCAN_EXT.has(extname(name))) {
      acc.push(full)
    }
  }
}

function scrubSnippet(line: string): string {
  return line
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/gi, '[redacted-email]')
    .replace(/\b(?:sk|pk|whsec|Bearer)[_-][A-Za-z0-9+/=._-]{8,}/gi, '[redacted-secret]')
    .trim()
    .slice(0, 140)
}

function toRel(cwd: string, abs: string): string {
  return relative(cwd, abs).split('\\').join('/')
}

function emptyCounts(): Record<StubScanRuleId, number> {
  return {
    todo_claude: 0,
    coming_soon: 0,
    not_implemented: 0,
    greyed: 0,
    not_deployed: 0,
    stub_word: 0,
    placeholder_deadend: 0,
    known_scaffold: 0,
  }
}

/** Dedup key: path + rule (not every line — one finding per file/rule). */
function hitKey(h: Pick<StubScanHit, 'path' | 'rule'>): string {
  return `${h.path}|${h.rule}`
}

export function scanCompanyOsSrc(cwd = process.cwd()): StubScanResult {
  const srcRoot = resolveSrcRoot(cwd)
  if (!srcRoot) {
    return {
      root: null,
      filesScanned: 0,
      hits: [],
      counts: emptyCounts(),
      skipped: true,
      skipReason: 'src/ not found on disk — scanner cannot claim a clean tree',
    }
  }

  const files: string[] = []
  walkFiles(srcRoot, files)

  const seen = new Set<string>()
  const hits: StubScanHit[] = []

  for (const abs of files) {
    const rel = toRel(cwd, abs)
    if (EXCLUDE_REL.has(rel)) continue
    let text: string
    try {
      text = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (line.includes(IGNORE_LINE)) continue
      for (const rule of LINE_RULES) {
        if (rule.id === 'placeholder_deadend' && /\bplaceholder\s*=/.test(line)) continue
        if (rule.id === 'not_deployed' && /code not deployed/i.test(line)) continue
        if (
          rule.id === 'stub_word' &&
          /stub-scan|stub_scan|stub-file|stub scanner|stub-scanner|stub directives|const stubs|type stubs/i.test(
            line
          )
        ) {
          continue
        }
        if (!rule.re.test(line)) continue
        const key = hitKey({ path: rel, rule: rule.id })
        if (seen.has(key)) continue
        seen.add(key)
        hits.push({
          path: rel,
          line: i + 1,
          rule: rule.id,
          snippet: scrubSnippet(line),
          status: rule.status,
          category: rule.category,
        })
      }
    }
  }

  for (const known of KNOWN_SCAFFOLDS) {
    const abs = join(cwd, known.rel)
    if (!existsSync(abs)) continue
    const key = hitKey({ path: known.rel, rule: 'known_scaffold' })
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({
      path: known.rel,
      line: 1,
      rule: 'known_scaffold',
      snippet: known.label,
      status: 'warn',
      category: 'underbuilt_pages',
    })
  }

  hits.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)

  const counts = emptyCounts()
  for (const h of hits) {
    counts[h.rule] += 1
  }

  return {
    root: srcRoot,
    filesScanned: files.length,
    hits,
    counts,
    skipped: false,
  }
}

export function stubScanSummaryLabel(scan: StubScanResult): string {
  if (scan.skipped) {
    return `? Scanner skipped — ${scan.skipReason ?? 'src/ missing'}`
  }
  const n = scan.hits.length
  if (n === 0) {
    return `✓ File scan clean — 0 dead-end hits in ${scan.filesScanned} files`
  }
  const errors = scan.hits.filter((h) => h.status === 'error').length
  if (errors > 0) {
    return `✕ File scan — ${n} hit(s), ${errors} Coming Soon / error · ${scan.filesScanned} files`
  }
  return `▲ File scan — ${n} hit(s) in ${scan.filesScanned} files`
}

export function findingsFromStubScan(scan: StubScanResult): NightCleanerFinding[] {
  if (scan.skipped) {
    return [
      {
        id: 'stub-scan-skipped',
        category: 'stubs_placeholders',
        pathKind: 'ops',
        status: 'unknown',
        shape: statusToShape('unknown'),
        label: stubScanSummaryLabel(scan),
        detail: scan.skipReason,
        ref: 'src/',
      },
    ]
  }

  const out: NightCleanerFinding[] = [
    {
      id: 'stub-scan-summary',
      category: 'stubs_placeholders',
      pathKind: 'ops',
      status:
        scan.hits.some((h) => h.status === 'error')
          ? 'error'
          : scan.hits.length > 0
            ? 'warn'
            : 'ok',
      shape: statusToShape(
        scan.hits.some((h) => h.status === 'error')
          ? 'error'
          : scan.hits.length > 0
            ? 'warn'
            : 'ok'
      ),
      label: stubScanSummaryLabel(scan),
      detail: `todo_claude=${scan.counts.todo_claude} coming_soon=${scan.counts.coming_soon} stub=${scan.counts.stub_word} not_implemented=${scan.counts.not_implemented} known_scaffold=${scan.counts.known_scaffold}`,
      ref: 'src/',
    },
  ]

  for (const [i, h] of scan.hits.entries()) {
    out.push({
      id: `stub-${i + 1}`,
      category: h.category,
      pathKind: 'ops',
      status: h.status,
      shape: statusToShape(h.status),
      label: `${h.path}:${h.line} · ${h.rule}`,
      detail: h.snippet,
      ref: h.path,
    })
  }
  return out
}

export function tasksFromStubScan(scan: StubScanResult): NightCleanerTask[] {
  return scan.hits
    .filter((h) => h.status === 'warn' || h.status === 'error')
    .map((h, i) => ({
      id: `stub-task-${i + 1}`,
      title: `${h.path}:${h.line} · ${h.rule} — ${h.snippet.slice(0, 80)}`,
      status: h.status,
      shape: statusToShape(h.status),
      label: statusToMorningLabel(h.status),
      pathKind: 'ops',
      category: h.category,
      priorityHint: h.status === 'error' ? 'HIGH' : 'NORMAL',
      findingIds: [`stub-${i + 1}`],
    }))
}

export function buildStubScanReport(opts?: {
  environment?: NightCleanerReport['environment']
  gitSha?: string
  cwd?: string
}): NightCleanerReport {
  const started = new Date().toISOString()
  const scan = scanCompanyOsSrc(opts?.cwd)
  const findings = findingsFromStubScan(scan)
  const tasks = tasksFromStubScan(scan)
  const overallStatus: NightCleanerStatus = scan.skipped
    ? 'unknown'
    : tasks.some((t) => t.status === 'error')
      ? 'error'
      : tasks.some((t) => t.status === 'warn')
        ? 'warn'
        : 'ok'

  const score =
    scan.skipped ? 0 : overallStatus === 'ok' ? 94 : overallStatus === 'warn' ? 62 : 35

  return {
    schemaVersion: NIGHT_CLEANER_SCHEMA_VERSION,
    runId: `stub-scan-${randomUUID().slice(0, 8)}`,
    startedAt: started,
    finishedAt: new Date().toISOString(),
    source: 'cron',
    productLine: 'company-os',
    repo: 'wmorrison76/EchoAurion-Company-OS',
    gitSha: opts?.gitSha,
    environment: opts?.environment ?? 'local',
    overall: {
      status: overallStatus,
      shape: statusToShape(overallStatus),
      label: statusToMorningLabel(overallStatus),
      score0to100: score,
    },
    categories: [
      {
        id: 'stubs_placeholders',
        title: 'Stub / dead-end file scan (src/)',
        pathKind: 'ops',
        overall: {
          status: overallStatus,
          shape: statusToShape(overallStatus),
          label: stubScanSummaryLabel(scan),
        },
        findings,
        skipped: scan.skipped,
        skipReason: scan.skipReason,
      },
    ],
    tasks,
    systemImprovements: scan.hits.slice(0, 20).map((h) => `${h.path}:${h.line} · ${h.rule}`),
    expandIdeas: [
      'Implement or delete Gmail TODO(claude) on CRM outreach.',
      'Keep IVR/SMS/Railway labeled scaffold until Twilio / Railway are live or retired.',
    ],
  }
}

export function formatStubScanCli(scan: StubScanResult): string {
  const lines = [
    stubScanSummaryLabel(scan),
    `filesScanned=${scan.filesScanned} hits=${scan.hits.length}`,
    `counts: coming_soon=${scan.counts.coming_soon} todo_claude=${scan.counts.todo_claude} stub=${scan.counts.stub_word} not_implemented=${scan.counts.not_implemented} not_deployed=${scan.counts.not_deployed} known_scaffold=${scan.counts.known_scaffold}`,
    '',
  ]
  for (const h of scan.hits) {
    lines.push(`${statusToShape(h.status)} ${h.path}:${h.line} · ${h.rule}`)
    lines.push(`   ${h.snippet}`)
  }
  if (scan.hits.length === 0 && !scan.skipped) {
    lines.push('✓ No matching dead-end strings in src/ (scan actually walked files).')
  }
  return lines.join('\n')
}
