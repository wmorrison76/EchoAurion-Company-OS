/**
 * Env flags for Help Desk auto-Knights / auto-send.
 *
 * SECURITY: Drafting advice is not production authorization. Unattended
 * customer-facing sends require explicit opt-in; unset or malformed flags
 * may NOT grant agent authority.
 */

function explicitEnabled(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

/**
 * Non-executing Knights draft generation remains enabled by default.
 * An EXPLICIT false is always a kill switch, even when standby is active.
 * This permission never authorizes response sends, tool execution, or builds.
 */
export function shouldAutoKnightsOnQuestion(): boolean {
  const flag = process.env.AUTO_KNIGHTS_ON_QUESTION
  if (flag === undefined || flag.trim() === '') return true
  return explicitEnabled(flag)
}

/** Low-risk TECH/OTHER auto-send only when explicitly configured. */
export function envHelpDeskAutoSendTech(): boolean {
  return explicitEnabled(process.env.HELP_DESK_AUTO_SEND_TECH)
}

/**
 * Echo AI–captured low-risk TEXT autoapproval. BUILD/BILLING/code/core remain
 * gated by ticket-level policy, and these env flags MUST NOT bypass it.
 * Unset, empty and malformed configuration fail closed.
 */
export function envEchoAutoApprove(): boolean {
  const raw = process.env.ECHO_AUTO_APPROVE ?? process.env.HELP_DESK_ECHO_AUTO_APPROVE
  return explicitEnabled(raw)
}

/**
 * General low-risk TEXT autoapproval: explicit opt-in only.
 * Never grant approval simply because the flag is absent in production.
 */
export function envHelpDeskAutoApprove(): boolean {
  return explicitEnabled(process.env.HELP_DESK_AUTO_APPROVE)
}
