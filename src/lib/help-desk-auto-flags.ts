/**
 * Env flags for Help Desk auto-Knights / auto-send.
 * Kept tiny to avoid circular imports between standby ↔ knights ↔ watch.
 */

/**
 * Auto-run Knights when a new inbound question arrives.
 * Default ON (William's ask). Set AUTO_KNIGHTS_ON_QUESTION=false to disable
 * unless standby/autonomy is draft_only | assist | standby | autopilot | auto_answer_low_risk.
 */
export function shouldAutoKnightsOnQuestion(): boolean {
  const flag = (process.env.AUTO_KNIGHTS_ON_QUESTION ?? 'true').trim().toLowerCase()
  if (flag === 'true' || flag === '1' || flag === 'yes') return true
  if (flag === 'false' || flag === '0' || flag === 'no') {
    const autonomy = (process.env.AUTONOMY_DIAL ?? '').trim().toLowerCase()
    if (autonomy === 'assist' || autonomy === 'standby' || autonomy === 'autopilot') {
      return true
    }
    const standby = (process.env.KNIGHTS_STANDBY_MODE ?? 'off').trim().toLowerCase()
    return (
      standby === 'draft_only' ||
      standby === 'auto_answer_low_risk' ||
      standby === 'assist' ||
      standby === 'standby' ||
      standby === 'autopilot'
    )
  }
  return true
}

/**
 * When true, low-risk TEXT TECH/OTHER may auto-send after Knights draft
 * without a timed permit or standby mode. Never BUILD/BILLING/code/core.
 */
export function envHelpDeskAutoSendTech(): boolean {
  const v = (process.env.HELP_DESK_AUTO_SEND_TECH ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

/**
 * Echo AI–captured tickets (source echo_ai / channel ECHO / echoPriority):
 * after Knights draft (or soft refuse/greeting), auto-approve & send and always
 * emit `echo_repair_ready`. Never auto BUILD / core merge / payroll disclose.
 *
 * Default **true** (testing). Set `ECHO_AUTO_APPROVE=false` (or
 * `HELP_DESK_ECHO_AUTO_APPROVE=false`) for production dual-control.
 */
export function envEchoAutoApprove(): boolean {
  const raw =
    process.env.ECHO_AUTO_APPROVE ?? process.env.HELP_DESK_ECHO_AUTO_APPROVE ?? ''
  const v = raw.trim().toLowerCase()
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true
  // Unset → true (William: testing now; set false for prod dual-control).
  return true
}

/**
 * Dev fast-path: auto-approve & send **all** Help Desk TEXT tickets after Knights
 * draft (not Echo-only). BUILD / BILLING / FEATURE / needsHumanCoreReview stay locked.
 *
 * Default **true** when unset (testing — no Dr. OS Approve click per ticket).
 * Set `HELP_DESK_AUTO_APPROVE=false` for production dual-control.
 * Bulk clear existing queue: POST /api/ops/approve-all-awaiting (or Help Desk button).
 */
export function envHelpDeskAutoApprove(): boolean {
  const raw = (process.env.HELP_DESK_AUTO_APPROVE ?? '').trim().toLowerCase()
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true
  // Unset → true (same testing default as ECHO_AUTO_APPROVE).
  return true
}
