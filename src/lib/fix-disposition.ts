/**
 * Help Desk: distinguish chat reply vs product code fix.
 * Approve & send never merges/deploys — disposition keeps that honest in the UI.
 */

export type FixDisposition =
  | 'reply_sent_code_pending'
  | 'resolved_fix'
  | 'resolved_howto'
  | 'resolved_config'
  | 'unknown'

export type FixDispositionBadge = {
  level: 'warn' | 'ok' | 'unknown'
  label: string
  disposition: FixDisposition
  sha: string | null
}

const SHA_RE = /\b(?:fixed in|fix(?:ed)? in|sha|commit)\s*[:=]?\s*`?([a-f0-9]{7,40})`?/i
const CODE_PENDING_RE =
  /needs_code_change|code.?change|draft pr|build locked|architect|await(?:ing)? deploy|not (?:yet )?deployed|merge required|no auto-merge|code pending/i
const CODE_SHIPPED_RE =
  /deploy(?:ed)?|shipped|merged|fix is live|live on render|hot.?fix|bundle live|productFixDeployed/i

/** Extract short SHA from free text if present. */
export function extractFixedInSha(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(SHA_RE)
  return m?.[1]?.slice(0, 12) ?? null
}

/** Knights / Maestro signal that a product change is still required. */
export function looksLikeCodeChangePending(opts: {
  answer?: string | null
  subject?: string | null
  needsHumanCoreReview?: boolean | null
  messageBodies?: Array<string | null | undefined>
}): boolean {
  if (opts.needsHumanCoreReview) return true
  const blobs = [opts.answer, opts.subject, ...(opts.messageBodies ?? [])]
    .filter(Boolean)
    .join('\n')
  if (!blobs) return false
  if (CODE_SHIPPED_RE.test(blobs) && extractFixedInSha(blobs)) return false
  return CODE_PENDING_RE.test(blobs)
}

/** Infer disposition for badge + closeReason stamping. */
export function inferFixDisposition(opts: {
  status?: string | null
  closeReason?: string | null
  answer?: string | null
  subject?: string | null
  needsHumanCoreReview?: boolean | null
  messageBodies?: Array<string | null | undefined>
}): FixDisposition {
  const reason = (opts.closeReason ?? '').trim()
  if (
    reason === 'reply_sent_code_pending' ||
    reason === 'resolved_fix' ||
    reason === 'resolved_howto' ||
    reason === 'resolved_config'
  ) {
    return reason
  }

  const blobs = [opts.answer, opts.subject, ...(opts.messageBodies ?? [])]
    .filter(Boolean)
    .join('\n')
  const sha = extractFixedInSha(blobs)
  if (sha || (CODE_SHIPPED_RE.test(blobs) && /render|deploy|merged|shipped/i.test(blobs))) {
    return 'resolved_fix'
  }
  if (looksLikeCodeChangePending(opts)) {
    return 'reply_sent_code_pending'
  }
  if (opts.status === 'RESOLVED' || opts.status === 'CLOSED') {
    return 'resolved_howto'
  }
  return 'unknown'
}

/** Shape+label badge for Help Desk list/detail (colorblind-safe). */
export function fixDispositionBadge(opts: {
  status?: string | null
  closeReason?: string | null
  answer?: string | null
  subject?: string | null
  needsHumanCoreReview?: boolean | null
  messageBodies?: Array<string | null | undefined>
}): FixDispositionBadge | null {
  const disposition = inferFixDisposition(opts)
  const blobs = [opts.answer, opts.subject, opts.closeReason, ...(opts.messageBodies ?? [])]
    .filter(Boolean)
    .join('\n')
  const sha = extractFixedInSha(blobs)

  if (disposition === 'reply_sent_code_pending') {
    return {
      level: 'warn',
      label: '▲ Chat replied · Code not deployed',
      disposition,
      sha: null,
    }
  }
  if (disposition === 'resolved_fix') {
    return {
      level: 'ok',
      label: sha ? `✓ Fixed in ${sha}` : '✓ Fixed in product (verify deploy)',
      disposition,
      sha,
    }
  }
  // Only surface reply-only noise for terminal tickets that look code-ish
  if (
    (opts.status === 'RESOLVED' || opts.status === 'CLOSED') &&
    looksLikeCodeChangePending(opts)
  ) {
    return {
      level: 'warn',
      label: '▲ Chat replied · Code not deployed',
      disposition: 'reply_sent_code_pending',
      sha: null,
    }
  }
  return null
}

/** closeReason to stamp on Approve & send (mode=reply). */
export function closeReasonForApprove(opts: {
  answer?: string | null
  subject?: string | null
  needsHumanCoreReview?: boolean | null
  messageBodies?: Array<string | null | undefined>
}): 'reply_sent_code_pending' | 'resolved_fix' | 'resolved_howto' {
  const d = inferFixDisposition({ ...opts, status: 'RESOLVED' })
  if (d === 'reply_sent_code_pending') return 'reply_sent_code_pending'
  if (d === 'resolved_fix') return 'resolved_fix'
  return 'resolved_howto'
}
