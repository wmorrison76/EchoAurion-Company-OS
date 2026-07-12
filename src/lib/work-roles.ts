/**
 * Product profile roles for paid / build-request gating.
 * LINE and other staff can open Tech support; only ADMIN / DIRECTOR / EXEC
 * may submit Build requests or sign WorkAgreements.
 * See docs/PAID_VIA_PROFILE.md.
 *
 * EXEC-capable aliases (map → EXEC):
 *   executive-chef, general-manager / gm, property-manager,
 *   owner, exec_*, *executive*
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
  // Admin
  if (key === 'SYSADMIN' || key === 'IT_ADMIN') return 'ADMIN'
  // Director
  if (
    key === 'DIR' ||
    key === 'VP' ||
    key === 'REGIONAL_DIRECTOR' ||
    key === 'FB_DIRECTOR' ||
    key.endsWith('_DIRECTOR') ||
    key.startsWith('DIR_')
  ) {
    return 'DIRECTOR'
  }
  // EXEC-capable property leadership (pay-gate)
  if (
    key === 'GM' ||
    key === 'GENERAL_MANAGER' ||
    key === 'PROPERTY_MANAGER' ||
    key === 'EXECUTIVE_CHEF' ||
    key === 'EXECUTIVE' ||
    key === 'OWNER' ||
    key.startsWith('EXEC_') ||
    key.includes('EXECUTIVE')
  ) {
    return 'EXEC'
  }
  if (key === 'LEAD' || key === 'SHIFT_LEAD' || key === 'SOUS_CHEF') return 'SUPERVISOR'
  if (key === 'STAFF' || key === 'ASSOCIATE' || key === 'SERVER' || key === 'HOURLY') return 'LINE'
  if (key === 'CONTROLLER' || key.endsWith('_MANAGER')) return 'MANAGER'
  return null
}

export function canRequestBuild(role: string | null | undefined): boolean {
  const r = normalizePilotRole(role)
  if (!r) return false
  return (BUILD_AUTHORIZED_ROLES as readonly string[]).includes(r)
}

export function buildRoleGateMessage(role: string | null | undefined): string {
  const r = normalizePilotRole(role) ?? (role?.trim() || 'unknown')
  return `Build requests are limited to ADMIN, DIRECTOR, or EXEC profiles (includes general-manager, property-manager, executive-chef). Your role maps to “${r}”.`
}
