// Shared application types. Module-specific types are added in their build steps.

/** Standard API route response shape (CLAUDE.md §18). */
export type APIResponse<T> =
  | { success: true; data: T; meta?: { lastUpdated: string } }
  | { success: false; error: string; code?: string }

/** The two actors recognised by the audit trail (CLAUDE.md §8.3). */
export type Actor = 'william_morrison' | 'computer_agent'

/** Application roles (CLAUDE.md §8.3). */
export type Role = 'dr_os' | 'computer_agent'

/** Status taxonomy — always paired with a shape + label in the UI (§3, §4). */
export type StatusLevel = 'ok' | 'warn' | 'error' | 'unknown'
