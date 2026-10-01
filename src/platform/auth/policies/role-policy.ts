import type { UserRole } from '@/src/shared/types'

const ROLE_HIERARCHY: Record<UserRole, number> = {
  field_engineer: 4,
  administrator: 3,
  manager: 2,
  tenant: 1,
}

export const hasRole = (
  userRole: UserRole,
  requiredRole: UserRole,
): boolean => {
  if (userRole === 'field_engineer' || requiredRole === 'field_engineer') {
    return userRole === requiredRole
  }
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export const hasAnyRole = (
  userRole: UserRole,
  requiredRoles: UserRole[],
): boolean => {
  return requiredRoles.includes(userRole)
}
