/**
 * Echo AI–originated Help Desk tickets take queue priority.
 * Detected via relay context.source === 'echo_ai' | echoPriority | intakeChannel ECHO.
 */

export const ECHO_PRIORITY = 'URGENT' as const
export const ECHO_INTAKE_CHANNEL = 'ECHO' as const
export const ECHO_BADGE = { shape: '◆', label: 'Echo AI' } as const

/** Tighter SLA for Echo AI tickets (minutes). */
export const ECHO_SLA_FIRST_RESPONSE_MINUTES = 15
export const ECHO_SLA_RESOLVE_MINUTES = 2 * 60

const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
}

export function isEchoAiContext(context: unknown): boolean {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return false
  const c = context as Record<string, unknown>
  if (c.source === 'echo_ai' || c.source === 'echo') return true
  if (c.echoPriority === true) return true
  const ch = String(c.intakeChannel ?? '').toUpperCase()
  if (ch === 'ECHO') return true
  if (c.moduleHint === 'echo_ai') return true
  return false
}

export function isEchoAiTicket(opts: {
  intakeChannel?: string | null
  priority?: string | null
  moduleHint?: string | null
  echoAi?: boolean | null
}): boolean {
  if (opts.echoAi === true) return true
  if (String(opts.intakeChannel ?? '').toUpperCase() === 'ECHO') return true
  if (opts.moduleHint === 'echo_ai') return true
  return false
}

export function priorityRank(priority: string | null | undefined): number {
  return PRIORITY_RANK[String(priority ?? 'NORMAL').toUpperCase()] ?? 9
}

/** Sort key: Echo first, then URGENT→LOW, then newest updatedAt. */
export function compareHelpDeskQueue(
  a: {
    echoAi?: boolean
    intakeChannel?: string | null
    priority?: string | null
    moduleHint?: string | null
    updatedAt: string | Date
  },
  b: {
    echoAi?: boolean
    intakeChannel?: string | null
    priority?: string | null
    moduleHint?: string | null
    updatedAt: string | Date
  }
): number {
  const aEcho = isEchoAiTicket(a)
  const bEcho = isEchoAiTicket(b)
  if (aEcho !== bEcho) return aEcho ? -1 : 1
  const pr = priorityRank(a.priority) - priorityRank(b.priority)
  if (pr !== 0) return pr
  const aT = typeof a.updatedAt === 'string' ? Date.parse(a.updatedAt) : a.updatedAt.getTime()
  const bT = typeof b.updatedAt === 'string' ? Date.parse(b.updatedAt) : b.updatedAt.getTime()
  return bT - aT
}

/** Heuristic: answer text / ticket tags imply a shipped code fix (soft reload). */
export function looksLikeCodeDeployFix(opts: {
  answer?: string | null
  moduleHint?: string | null
  intakeChannel?: string | null
  echoAi?: boolean
  context?: unknown
}): boolean {
  if (opts.echoAi || isEchoAiTicket(opts)) {
    const a = (opts.answer ?? '').toLowerCase()
    if (
      /deploy|shipped|merged|render|hot.?fix|soft.?reload|bundle|live now|fix is live|patch/.test(
        a
      )
    ) {
      return true
    }
  }
  const ctx =
    opts.context && typeof opts.context === 'object' && !Array.isArray(opts.context)
      ? (opts.context as Record<string, unknown>)
      : null
  if (ctx?.clientUpdate === 'soft_reload' || ctx?.productFixDeployed === true) {
    return true
  }
  if (ctx?.updateDirective === 'soft_reload' || ctx?.updateDirective === 'refresh_recommended') {
    return true
  }
  return false
}

/** Compact SYSTEM message body for Knights from Echo context. */
export function formatEchoContextSystemBody(context: Record<string, unknown>): string {
  const lines = ['◆ Echo AI failure context (auto-filed — queue priority)']
  const goals = typeof context.userGoals === 'string' ? context.userGoals : null
  if (goals) lines.push(`User asked: ${goals.slice(0, 600)}`)
  if (typeof context.failedStep === 'string') lines.push(`Failed step: ${context.failedStep}`)
  if (typeof context.lastError === 'string') lines.push(`Last error: ${context.lastError.slice(0, 400)}`)
  if (typeof context.echoTaskId === 'string') lines.push(`Echo task: ${context.echoTaskId}`)
  if (typeof context.failureKind === 'string') lines.push(`Kind: ${context.failureKind}`)
  if (Array.isArray(context.stepsCompleted) && context.stepsCompleted.length) {
    lines.push(`Steps: ${context.stepsCompleted.slice(0, 12).map(String).join(' → ')}`)
  }
  const sc = context.systemCheck
  if (sc && typeof sc === 'object' && !Array.isArray(sc)) {
    const snap = sc as { can?: unknown[]; cannot?: unknown[]; speakable?: unknown[] }
    const cannot = Array.isArray(snap.cannot)
      ? snap.cannot
          .slice(0, 6)
          .map((x) =>
            x && typeof x === 'object' && 'label' in x
              ? String((x as { label: unknown }).label)
              : String(x)
          )
          .join(', ')
      : ''
    if (cannot) lines.push(`System check cannot: ${cannot}`)
    if (Array.isArray(snap.speakable) && snap.speakable[0]) {
      lines.push(`Check: ${String(snap.speakable[0]).slice(0, 240)}`)
    }
  }
  if (typeof context.profileRole === 'string') lines.push(`Profile role: ${context.profileRole}`)
  if (typeof context.userId === 'string') lines.push(`User id: ${context.userId}`)
  return lines.join('\n').slice(0, 3500)
}
