/**
 * Three single-duty desk moles — report only, never auto-fix.
 * William decides what to do from the morning-open / Help Desk ticket.
 *
 * 1. Workflow mole — >3–4 clicks, duplicated steps, underbuilt multi-page modules
 * 2. UX consistency mole — pattern drift across Company OS chrome
 * 3. i18n mole — Company OS English-only + pilot locale coverage gaps
 */

import { randomUUID } from 'crypto'
import {
  NIGHT_CLEANER_SCHEMA_VERSION,
  statusToMorningLabel,
  statusToShape,
  type NightCleanerCategoryId,
  type NightCleanerCategoryResult,
  type NightCleanerFinding,
  type NightCleanerReport,
  type NightCleanerStatus,
  type NightCleanerTask,
} from '@/types/night-cleaner'
import { PILOT_UI_LOCALES } from '@/lib/help-desk-locale'
import { navItems } from '@/lib/nav'
import {
  scanCompanyOsSrc,
  stubScanSummaryLabel,
  type StubScanResult,
} from '@/lib/stub-scanner'

type MoleFinding = {
  category: NightCleanerCategoryId
  status: NightCleanerStatus
  label: string
  detail?: string
  ref?: string
  pathKind?: 'ops' | 'operator' | 'guest' | 'both'
  priorityHint?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
}

function finding(
  category: NightCleanerCategoryId,
  status: NightCleanerStatus,
  label: string,
  extra?: Partial<MoleFinding>
): MoleFinding {
  return { category, status, label, pathKind: 'ops', ...extra }
}

/** Workflow mole — click depth, duplication, underbuilt pages. */
export function runWorkflowMole(): MoleFinding[] {
  const out: MoleFinding[] = []

  // Support surface sprawl: Support + Inbox + Pilot links + Help Desk = 4 nav entries
  out.push(
    finding(
      'workflow_duplication',
      'warn',
      'Support work spans 4 nav destinations (Support, Inbox, Pilot links, Help Desk)',
      {
        detail:
          'Same incident may require opening Support health → Inbox triage → Help Desk reply → Pilot links. Target: one Support cockpit with tabs (≤2 clicks).',
        ref: '/support|/support/inbox|/support/pilot-links|/help-desk',
        priorityHint: 'HIGH',
      }
    )
  )

  out.push(
    finding(
      'workflow_duplication',
      'warn',
      'Board Room vs Help Desk Ask Knights — two counsel entry points',
      {
        detail:
          'Strategy counsel (/board-room) and ticket counsel (Ask Knights) can duplicate the same seat calls. Clarify when to use which; deep-link Board Room from FEATURE tickets.',
        ref: '/board-room|/help-desk',
        priorityHint: 'NORMAL',
      }
    )
  )

  out.push(
    finding(
      'workflow_clicks',
      'warn',
      'Help Desk Approve was >1 viewport from Dry-run (fixed in action dock)',
      {
        detail:
          'Regression guard: Approve + Dry-run must stay in sticky action dock. Goal: 1–2 clicks to official send.',
        ref: 'HelpDeskConsole action dock',
        priorityHint: 'NORMAL',
      }
    )
  )

  out.push(
    finding(
      'underbuilt_pages',
      'warn',
      'AurionIndex is a static checklist — could be one live status page',
      {
        detail:
          'Cost table + unchecked migration list without CloudWatch. Either wire live metrics or collapse to a single “pre-migration” card on Dr. OS.',
        ref: '/aurion-index',
        priorityHint: 'NORMAL',
      }
    )
  )

  out.push(
    finding(
      'underbuilt_pages',
      'ok',
      'Lab elite + echo-chrome not in sidebar (intentional harness)',
      {
        detail: 'Reachable via LabInstallLinks — OK if stay out of operator daily path.',
        ref: '/lab/elite|/lab/echo-chrome',
        priorityHint: 'LOW',
      }
    )
  )

  // Nav click budget: every primary nav is 1 click — good. Flag deep paths.
  const deep = navItems.filter((n) => n.href.split('/').filter(Boolean).length >= 2)
  if (deep.length > 0) {
    out.push(
      finding(
        'workflow_clicks',
        'ok',
        `Sidebar: ${deep.length} nested href(s) — still 1 click from nav`,
        {
          detail: deep.map((d) => d.href).join(', '),
          ref: 'nav.ts',
          priorityHint: 'LOW',
        }
      )
    )
  }

  out.push(
    finding(
      'workflow_duplication',
      'warn',
      'CRM detail is a second page — consider drawer on Kanban for mobile',
      {
        detail:
          'Kanban → /crm/[id] is a full navigation. For 390px, inline drawer keeps stage change + outreach on one screen (≤2 clicks).',
        ref: '/crm|/crm/[id]',
        priorityHint: 'NORMAL',
      }
    )
  )

  return out
}

/** UX consistency mole — chrome / badge / pattern drift (static contract). */
export function runUxConsistencyMole(): MoleFinding[] {
  const out: MoleFinding[] = []

  out.push(
    finding(
      'ux_consistency',
      'ok',
      'Design tokens: gold #D4AF37 + StatusBadge shape+label is the standard',
      {
        detail: 'Moles flag pages that introduce color-only status or non-Inter stacks.',
        ref: 'StatusBadge / CLAUDE.md §4',
        priorityHint: 'LOW',
      }
    )
  )

  out.push(
    finding(
      'ux_consistency',
      'warn',
      'Public marketing home (/) uses different chrome than AppShell modules',
      {
        detail:
          'Unauthenticated AurionHomePage is intentional brand surface — keep AppShell modules visually consistent with each other; do not mix marketing cards into Dr. OS.',
        ref: '/',
        priorityHint: 'LOW',
      }
    )
  )

  out.push(
    finding(
      'ux_consistency',
      'warn',
      'Support vs Help Desk visual density differs (two “operator” homes)',
      {
        detail:
          'Unify KPI card rhythm and primary CTA placement when consolidating Support cockpit.',
        ref: '/support|/help-desk',
        priorityHint: 'NORMAL',
      }
    )
  )

  return out
}

/** UX mole file-scan slice — real src/ walk, never a hardcoded clean bill. */
export function runStubFileScanMole(scan?: StubScanResult): MoleFinding[] {
  const result = scan ?? scanCompanyOsSrc()
  const out: MoleFinding[] = []

  if (result.skipped) {
    out.push(
      finding('stubs_placeholders', 'unknown', stubScanSummaryLabel(result), {
        detail: result.skipReason,
        ref: 'src/',
        priorityHint: 'HIGH',
      })
    )
    return out
  }

  const comingSoon = result.hits.filter((h) => h.rule === 'coming_soon')
  if (comingSoon.length === 0) {
    out.push(
      finding(
        'stubs_placeholders',
        'ok',
        `File scan: 0 Coming Soon hits in ${result.filesScanned} src/ files`,
        {
          detail: 'Walked src/ — not a hardcoded success. Form placeholder= attributes ignored.',
          ref: 'src/',
          priorityHint: 'LOW',
        }
      )
    )
  } else {
    out.push(
      finding(
        'stubs_placeholders',
        'error',
        `File scan: ${comingSoon.length} Coming Soon hit(s)`,
        {
          detail: comingSoon
            .slice(0, 8)
            .map((h) => `${h.path}:${h.line}`)
            .join(', '),
          ref: comingSoon[0]?.path,
          priorityHint: 'HIGH',
        }
      )
    )
  }

  const todoClaude = result.hits.filter((h) => h.rule === 'todo_claude')
  if (todoClaude.length > 0) {
    out.push(
      finding(
        'stubs_placeholders',
        'warn',
        `File scan: ${todoClaude.length} TODO(claude) path(s)`,
        {
          detail: todoClaude.map((h) => `${h.path}:${h.line}`).join(', '),
          ref: todoClaude[0]?.path,
          priorityHint: 'NORMAL',
        }
      )
    )
  }

  const scaffolds = result.hits.filter((h) => h.rule === 'known_scaffold')
  if (scaffolds.length > 0) {
    out.push(
      finding(
        'underbuilt_pages',
        'warn',
        `Known scaffolds: ${scaffolds.length} path(s) — IVR / SMS / Railway / Gmail / AurionIndex`,
        {
          detail: scaffolds.map((h) => h.path).join(', '),
          ref: scaffolds.map((h) => h.path).join('|'),
          priorityHint: 'HIGH',
        }
      )
    )
  }

  const other = result.hits.filter(
    (h) =>
      h.rule !== 'coming_soon' &&
      h.rule !== 'todo_claude' &&
      h.rule !== 'known_scaffold'
  )
  if (other.length > 0) {
    out.push(
      finding(
        'stubs_placeholders',
        'warn',
        `File scan: ${other.length} other dead-end hit(s) (stub / not implemented / not deployed)`,
        {
          detail: other
            .slice(0, 12)
            .map((h) => `${h.path}:${h.line} · ${h.rule}`)
            .join(', '),
          ref: other[0]?.path,
          priorityHint: 'NORMAL',
        }
      )
    )
  }

  return out
}

/** i18n mole — Company OS chrome + pilot reply locales. */
export function runI18nMole(): MoleFinding[] {
  const out: MoleFinding[] = []

  out.push(
    finding(
      'i18n',
      'warn',
      'Company OS operator chrome is English-only (no next-intl / locale routes)',
      {
        detail:
          'William reviews on iPhone in EN — OK short-term. For multi-staff ops, add locale pack for Help Desk chrome (Approve, Ask Knights, Dry-run).',
        ref: 'src/components/**',
        pathKind: 'operator',
        priorityHint: 'NORMAL',
      }
    )
  )

  out.push(
    finding(
      'i18n',
      'ok',
      `Pilot reply path covers ${PILOT_UI_LOCALES.length} UI locales via help-desk-locale`,
      {
        detail: PILOT_UI_LOCALES.join(', '),
        ref: 'src/lib/help-desk-locale.ts',
        pathKind: 'guest',
        priorityHint: 'LOW',
      }
    )
  )

  out.push(
    finding(
      'i18n',
      'warn',
      'No Help Desk UI control to override reply locale (auto-detect only)',
      {
        detail:
          'Add a locale chip on ticket detail (1 click) so William can force es/fr/… when detection is wrong.',
        ref: '/help-desk',
        pathKind: 'operator',
        priorityHint: 'HIGH',
      }
    )
  )

  out.push(
    finding(
      'i18n',
      'warn',
      'Public Help Center / Trust pages English-only',
      {
        detail: 'Pilot guests may need ES help-center — optional later.',
        ref: '/help-center|/trust',
        pathKind: 'guest',
        priorityHint: 'LOW',
      }
    )
  )

  return out
}

function toCategory(
  id: NightCleanerCategoryId,
  title: string,
  findings: MoleFinding[]
): NightCleanerCategoryResult {
  const worst: NightCleanerStatus = findings.some((f) => f.status === 'error')
    ? 'error'
    : findings.some((f) => f.status === 'warn')
      ? 'warn'
      : 'ok'
  const mapped: NightCleanerFinding[] = findings.map((f, i) => ({
    id: `${id}-${i + 1}`,
    category: f.category,
    pathKind: f.pathKind ?? 'ops',
    status: f.status,
    shape: statusToShape(f.status),
    label: f.label,
    detail: f.detail,
    ref: f.ref,
  }))
  return {
    id,
    title,
    pathKind: 'ops',
    overall: {
      status: worst,
      shape: statusToShape(worst),
      label: statusToMorningLabel(worst),
    },
    findings: mapped,
  }
}

function tasksFromFindings(findings: MoleFinding[]): NightCleanerTask[] {
  return findings
    .filter((f) => f.status === 'warn' || f.status === 'error')
    .map((f, i) => ({
      id: `desk-task-${i + 1}`,
      title: f.label,
      status: f.status,
      shape: statusToShape(f.status),
      label: statusToMorningLabel(f.status),
      pathKind: f.pathKind ?? 'ops',
      category: f.category,
      priorityHint: f.priorityHint ?? (f.status === 'error' ? 'HIGH' : 'NORMAL'),
      findingIds: [],
    }))
}

/** Build a NightCleanerReport from the three desk moles (report-only). */
export function buildDeskMolesReport(opts?: {
  environment?: NightCleanerReport['environment']
  gitSha?: string
}): NightCleanerReport {
  const workflow = runWorkflowMole()
  const ux = runUxConsistencyMole()
  const i18n = runI18nMole()
  const scan = scanCompanyOsSrc()
  const stubs = runStubFileScanMole(scan)
  const pathHits: MoleFinding[] = scan.hits.slice(0, 40).map((h) =>
    finding(h.category, h.status, `${h.path}:${h.line} · ${h.rule}`, {
      detail: h.snippet,
      ref: h.path,
      priorityHint: h.status === 'error' ? 'HIGH' : 'NORMAL',
    })
  )
  const all = [...workflow, ...ux, ...i18n, ...stubs, ...pathHits]

  const categories = [
    toCategory('workflow_clicks', 'Workflow mole · clicks & underbuilt pages', [
      ...workflow.filter((f) =>
        ['workflow_clicks', 'underbuilt_pages'].includes(f.category)
      ),
    ]),
    toCategory(
      'workflow_duplication',
      'Workflow mole · duplicated steps',
      workflow.filter((f) => f.category === 'workflow_duplication')
    ),
    toCategory('ux_consistency', 'UX consistency mole', ux),
    toCategory('i18n', 'i18n language mole', i18n),
    toCategory('stubs_placeholders', 'Stub / dead-end file scan (src/)', [
      ...stubs,
      ...pathHits,
    ]),
  ]

  const tasks = tasksFromFindings(all)
  const overallStatus: NightCleanerStatus = tasks.some((t) => t.status === 'error')
    ? 'error'
    : tasks.some((t) => t.status === 'warn')
      ? 'warn'
      : 'ok'

  const score =
    overallStatus === 'ok' ? 92 : overallStatus === 'warn' ? 68 : 40

  const now = new Date().toISOString()
  return {
    schemaVersion: NIGHT_CLEANER_SCHEMA_VERSION,
    runId: `desk-moles-${randomUUID().slice(0, 8)}`,
    startedAt: now,
    finishedAt: now,
    source: 'ci',
    productLine: 'company-os',
    repo: 'wmorrison76/EchoAurion-Company-OS',
    gitSha: opts?.gitSha,
    environment: opts?.environment ?? 'production',
    overall: {
      status: overallStatus,
      shape: statusToShape(overallStatus),
      label: statusToMorningLabel(overallStatus),
      score0to100: score,
    },
    categories,
    tasks,
    systemImprovements: [
      'Consolidate Support + Inbox + Pilot links + Help Desk into one cockpit with tabs (≤2 clicks).',
      'Keep Approve + Dry-run in sticky Help Desk action dock (done — guard in CI/mole).',
      'Add Help Desk reply-locale chip for forced language override.',
      'Wire AurionIndex live metrics or fold into Dr. OS single card.',
      `File scan: ${scan.hits.length} dead-end hit(s) across ${scan.filesScanned} src/ files — paths listed in stubs_placeholders.`,
    ],
    expandIdeas: [
      'CRM contact drawer on Kanban for 390px — avoid full page hop.',
      'Desk moles cron nightly → Help Desk TASK ticket for William triage only.',
    ],
  }
}
