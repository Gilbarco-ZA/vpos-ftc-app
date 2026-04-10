import type { UserRole } from '@/src/shared/types'

const ROLE_HIERARCHY: Record<UserRole, number> = {
  administrator: 3,
  manager: 2,
  tenant: 1,
}

export const hasRole = (
  userRole: UserRole,
  requiredRole: UserRole,
): boolean => {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export const hasAnyRole = (
  userRole: UserRole,
  requiredRoles: UserRole[],
): boolean => {
  return requiredRoles.some((role) => hasRole(userRole, role))
}
