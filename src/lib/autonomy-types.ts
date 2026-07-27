/** Client-safe autonomy dial constants (no DB imports). */

export type AutonomyDial = 'assist' | 'standby' | 'autopilot'

export const AUTONOMY_DIALS: AutonomyDial[] = ['assist', 'standby', 'autopilot']

export const AUTONOMY_LABEL: Record<AutonomyDial, string> = {
  assist: 'Assist — draft only',
  standby: 'Standby — auto low-risk TEXT',
  autopilot: 'Autopilot — soft tools + auto TEXT (no merge/paid/T3+)',
}
