/**
 * Product profile roles for paid / build-request gating.
 * LINE and other staff can open Tech support; only ADMIN / DIRECTOR / EXEC
 * may submit Build requests or sign WorkAgreements.
 * See docs/PAID_VIA_PROFILE.md.
 */

export const PILOT_ROLES = [
  'LINE',
  'SUPERVISOR',
  'MANAGER',
  'ADMIN',
  'DIRECTOR',
  'EXEC',
] as const

export type PilotRole = (typeof PILOT_ROLES)[number]

/** Roles allowed to request paid builds and sign spend agreements. */
export const BUILD_AUTHORIZED_ROLES = ['ADMIN', 'DIRECTOR', 'EXEC'] as const
export type BuildAuthorizedRole = (typeof BUILD_AUTHORIZED_ROLES)[number]

export function normalizePilotRole(raw: string | null | undefined): PilotRole | null {
  if (!raw) return null
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, '_')
  if ((PILOT_ROLES as readonly string[]).includes(key)) return key as PilotRole
  // Common aliases from property HR / product mocks
  if (key === 'GM' || key === 'GENERAL_MANAGER' || key === 'OWNER') return 'EXEC'
  if (key === 'DIR' || key === 'VP') return 'DIRECTOR'
  if (key === 'SYSADMIN' || key === 'IT_ADMIN') return 'ADMIN'
  if (key === 'LEAD' || key === 'SHIFT_LEAD') return 'SUPERVISOR'
  if (key === 'STAFF' || key === 'ASSOCIATE' || key === 'SERVER') return 'LINE'
  return null
}

export function canRequestBuild(role: string | null | undefined): boolean {
  const r = normalizePilotRole(role)
  if (!r) return false
  return (BUILD_AUTHORIZED_ROLES as readonly string[]).includes(r)
}

export function buildRoleGateMessage(role: string | null | undefined): string {
  const r = normalizePilotRole(role) ?? (role?.trim() || 'unknown')
  return `Build requests are limited to ADMIN, DIRECTOR, or EXEC profiles. Your mock role is “${r}” — switch the profile role selector to EXEC (or ADMIN / DIRECTOR) to continue.`
}
