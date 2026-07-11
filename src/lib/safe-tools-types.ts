/** Client-safe allowlist + types for the safe toolbelt (no DB imports). */

export const SAFE_TOOLS = [
  'open_panel',
  'show_message',
  'navigate',
  'restart_worker',
  'clear_cache',
  'toggle_feature_flag',
  'open_pr',
  'rollback_hint',
] as const

export type SafeTool = (typeof SAFE_TOOLS)[number]

export interface ToolInvokeResult {
  tool: SafeTool
  dryRun: boolean
  executed: boolean
  autonomyDial: string
  message: string
  outboxEventId?: string
  detail?: Record<string, unknown>
}
