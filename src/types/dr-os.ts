import type { StatusLevel } from '@/types'
import type { DrainHealthSnapshot } from '@/types/drain-health'
import type {
  CostAnomalyChipSnapshot,
  HelpEvalChipSnapshot,
  NightCleanerChipSnapshot,
} from '@/types/ops-chips'

// ── Dr. OS status payloads (CLAUDE.md §10) ──────────────────────────────────

export interface GitHubRepoHealth {
  repo: string
  level: StatusLevel
  label: 'Active' | 'Stale' | 'Inactive' | 'Unknown'
  sha: string | null
  message: string | null
  author: string | null
  committedAt: string | null
  openPRs: number | null
  openIssues: number | null
  error?: string
}

export interface RenderDeployHealth {
  level: StatusLevel
  label: 'Live' | 'Deploying' | 'Failed' | 'Unknown' | 'Not configured'
  deployId: string | null
  triggeredAt: string | null
  durationSeconds: number | null
  error?: string
}

export interface NeonHealth {
  level: StatusLevel
  label: 'Connected' | 'Error'
  responseMs: number | null
  database: string | null
  /** From DATABASE_URL connection_limit when present (Neon pooled). */
  poolSize: number | null
  error?: string
}

export interface StripeMRRHealth {
  level: StatusLevel
  label: string
  mrr: number
  subscriptionCount: number
  /** Sum of active subscription amounts due at nextBillingAt (USD). */
  nextBillingTotal: number | null
  /** Soonest current_period_end among active subs (ISO). */
  nextBillingAt: string | null
  error?: string
}

export interface ActiveUsersHealth {
  level: StatusLevel
  label: string
  count: number | null
  updatedAt: string | null
  error?: string
}

export interface PilotHealth {
  level: StatusLevel
  name: string
  stage: string
  daysSinceContact: number | null
  notes: string | null
  error?: string
}

/** Live SupportClient heartbeats + connection config (Pilot Connection Hub). */
export interface PilotConnectionHealth {
  /**
   * Overall badge = pilot relay only (secret + heartbeats).
   * Chef's Brain / ECHO_AI are separate — never mark relay Offline when Brain unset.
   */
  level: StatusLevel
  label: string
  /** Relay slice — secret + recent heartbeats (independent of ECHO_AI). */
  relayLevel: StatusLevel
  relayLabel: string
  /** Chef's Brain slice — env + live probe (independent of heartbeats). */
  brainLevel: StatusLevel
  brainLabel: string
  onlineCount: number
  totalClients: number
  streamCount: number
  standbyMode: string
  standbyReviewCount: number
  /** Boolean only — never the secret value. */
  supportIngestSecretConfigured: boolean
  emailConfigured: boolean
  /** ECHO_AI_URL env present (not a live probe). */
  echoAiConfigured: boolean
  /** Live GET probe of ECHO_AI_URL (Chef's Brain / echo-brain). */
  chefsBrainConfigured: boolean
  /** Operator hint for Chef's Brain probe (never secrets). */
  chefsBrainDetail?: string
  /** ECHO_AI_KEY present — needed when luccca-web requires Bearer. */
  echoAiKeyConfigured?: boolean
  /** Canonical paste value for Render. */
  suggestedEchoAiUrl?: string
  lastHeartbeatAgeMs: number | null
  lastQuestionAgeMs: number | null
  /** Pending relay outbox rows for pilot delivery. */
  pendingOutbox: number
  /** Echo panel-watch guardrail — auto SYSTEM tickets when on. */
  echoPanelWatch: {
    level: StatusLevel
    shape: string
    label: string
    enabled: boolean
  }
  error?: string
}

/** Env/config gaps — William pastes on Render; Knights do not invent keys. */
export interface ConfigDebtItem {
  panel: string
  reason: string
  envVars: string[]
}

export interface ConfigDebtHealth {
  items: ConfigDebtItem[]
  ticketId: string | null
  ticketCreated: boolean
  generatedAt: string
  /** Company OS has RENDER_API_KEY — admin/computer_agent can upsert via API. */
  renderApiConfigured: boolean
  /** Config debt includes ECHO_AI_URL gap — UI may offer apply-suggested. */
  echoAiUrlDebt: boolean
}

export interface DrOsStatus {
  github: GitHubRepoHealth[]
  render: RenderDeployHealth
  neon: NeonHealth
  stripe: StripeMRRHealth
  activeUsers: ActiveUsersHealth
  pilot: PilotHealth
  pilotConnection: PilotConnectionHealth
  configDebt: ConfigDebtHealth
  drain: DrainHealthSnapshot
  nightCleaner: NightCleanerChipSnapshot
  helpEval: HelpEvalChipSnapshot
  costAnomaly: CostAnomalyChipSnapshot
  generatedAt: string
}

export interface AuditEntry {
  id: string
  actor: string
  action: string
  entityId: string | null
  createdAt: string
  /** Redacted JSON payload (null when empty). */
  payload?: unknown
}
