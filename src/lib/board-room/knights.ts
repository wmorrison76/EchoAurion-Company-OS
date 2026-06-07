import type { KnightConfig, Seat } from '@/types/board-room'

// The roster — seats, roles, and the env var that activates each (spec §"The
// Knights"). Models default to the spec's recommendations and can be overridden
// by env later. The Maestro (Perplexity) is the conductor: it routes and
// synthesizes rather than being dispatched as a knight.
export const ROSTER: Record<Seat, KnightConfig> = {
  maestro: {
    seat: 'maestro',
    name: 'Maestro',
    model: 'sonar-pro',
    provider: 'perplexity',
    role: 'Conductor — routes tasks and synthesizes the action plan',
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    hasDbAccess: false,
    conductor: true,
  },
  analyst: {
    seat: 'analyst',
    name: 'The Analyst',
    model: 'gpt-5',
    provider: 'openai',
    role: 'Financial modeling, P&L impact, investor materials',
    apiKeyEnv: 'OPENAI_API_KEY',
    hasDbAccess: false,
  },
  scout: {
    seat: 'scout',
    name: 'The Scout',
    model: 'gemini-1.5-pro',
    provider: 'google',
    role: 'Real-time web intelligence and competitive monitoring',
    apiKeyEnv: 'GOOGLE_AI_API_KEY',
    hasDbAccess: false,
  },
  strategist: {
    seat: 'strategist',
    name: 'The Strategist',
    model: 'claude-opus-4-8',
    provider: 'anthropic',
    role: 'Long-context reasoning, legal/contract review, deep analysis',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    hasDbAccess: false,
  },
  chefs_brain: {
    seat: 'chefs_brain',
    name: "The Chef's Brain",
    model: 'echo-ai3',
    provider: 'echo',
    role: 'Hospitality-domain expert — the only seat with live DB access',
    apiKeyEnv: 'ECHO_AI_URL',
    hasDbAccess: true,
  },
  architect: {
    seat: 'architect',
    name: 'The Architect',
    model: 'claude-code',
    provider: 'anthropic',
    role: 'Codebase work — implements decisions, reviews PRs, builds modules',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    hasDbAccess: false,
  },
}

export const MAESTRO = ROSTER.maestro

/** Seats dispatched in parallel (everyone except the conductor). */
export const KNIGHT_SEATS: Seat[] = (Object.keys(ROSTER) as Seat[]).filter(
  (s) => !ROSTER[s].conductor
)

export function knightConfigured(config: KnightConfig): boolean {
  return Boolean(process.env[config.apiKeyEnv])
}
