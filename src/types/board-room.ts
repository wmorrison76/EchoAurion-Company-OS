// ── Board Room types (board-room-spec.md) ───────────────────────────────────

export type Seat =
  | 'maestro'
  | 'analyst'
  | 'scout'
  | 'strategist'
  | 'chefs_brain'
  | 'architect'

export type KnightProvider = 'perplexity' | 'openai' | 'anthropic' | 'google' | 'echo'

export type KnightStatus = 'PENDING' | 'RESPONDED' | 'UNAVAILABLE' | 'TIMEOUT' | 'ERROR'

export type SessionStatus = 'DISPATCHING' | 'SYNTHESIZING' | 'COMPLETE' | 'FAILED'

export interface KnightConfig {
  seat: Seat
  name: string // e.g. "The Analyst"
  model: string // display model id
  provider: KnightProvider
  role: string // one-line domain role
  apiKeyEnv: string // env var that activates this seat
  /** Only the Chef's Brain (Echo AI) gets live DB access (spec note #3). */
  hasDbAccess: boolean
  /** Maestro is the conductor, not a dispatched knight. */
  conductor?: boolean
}

export interface KnightResponseDTO {
  id: string
  seat: Seat
  name: string
  model: string
  status: KnightStatus
  content: string | null
  error: string | null
  latencyMs: number | null
}

export interface BoardRoomSessionDTO {
  id: string
  problem: string
  sandbox: boolean
  status: SessionStatus
  synthesis: string | null
  actor: string
  createdAt: string
  responses: KnightResponseDTO[]
}

export interface BoardRoomSessionSummary {
  id: string
  problem: string
  sandbox: boolean
  status: SessionStatus
  createdAt: string
  knightCount: number
  respondedCount: number
}
