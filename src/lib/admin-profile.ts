/**
 * Super Admin / Dr. OS identity helpers.
 * Canonical ADMIN_EMAIL for Elite testing: william@echoaurion.com
 */

export const CANONICAL_ADMIN_EMAIL = 'william@echoaurion.com'

/** True when email matches configured ADMIN_EMAIL (case-insensitive). */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const admin = (process.env.ADMIN_EMAIL ?? CANONICAL_ADMIN_EMAIL).trim().toLowerCase()
  if (!email) return false
  return email.trim().toLowerCase() === admin
}

/**
 * Session role for Company OS is always `dr_os` after login.
 * For paid-via-profile / lab gates, Super Admin surfaces as EXEC.
 */
export function superAdminPaidRole(): 'EXEC' {
  return 'EXEC'
}

export function superAdminDisplayRole(): { os: 'DR. OS'; paid: 'EXEC' } {
  return { os: 'DR. OS', paid: 'EXEC' }
}

export function resolveAdminEmailForDocs(): string {
  return (process.env.ADMIN_EMAIL ?? CANONICAL_ADMIN_EMAIL).trim() || CANONICAL_ADMIN_EMAIL
}
