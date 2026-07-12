import type { StatusLevel } from '@/types'

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
  label: 'Live' | 'Deploying' | 'Failed' | 'Unknown'
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
  error?: string
}

export interface StripeMRRHealth {
  level: StatusLevel
  label: string
  mrr: number
  subscriptionCount: number
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
  level: StatusLevel
  label: string
  onlineCount: number
  totalClients: number
  streamCount: number
  standbyMode: string
  standbyReviewCount: number
  /** Boolean only — never the secret value. */
  supportIngestSecretConfigured: boolean
  emailConfigured: boolean
  echoAiConfigured: boolean
  chefsBrainConfigured: boolean
  lastHeartbeatAgeMs: number | null
  lastQuestionAgeMs: number | null
  pendingOutbox: number
  error?: string
}

export interface DrOsStatus {
  github: GitHubRepoHealth[]
  render: RenderDeployHealth
  neon: NeonHealth
  stripe: StripeMRRHealth
  activeUsers: ActiveUsersHealth
  pilot: PilotHealth
  pilotConnection: PilotConnectionHealth
  generatedAt: string
}

export interface AuditEntry {
  id: string
  actor: string
  action: string
  entityId: string | null
  createdAt: string
}
