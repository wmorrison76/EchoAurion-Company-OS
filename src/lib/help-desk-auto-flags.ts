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
