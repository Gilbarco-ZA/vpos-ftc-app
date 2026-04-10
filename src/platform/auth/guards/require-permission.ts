import type { SessionUser, UserRole } from '@/src/shared/types'

import { AuthError } from '@/src/platform/auth/errors'
import { requireUser } from '@/src/platform/auth/guards/require-user'
import { hasAnyRole } from '@/src/platform/auth/policies/role-policy'

export const requirePermission = async (
  requiredRoles?: UserRole[],
): Promise<SessionUser> => {
  const user = await requireUser()

  if (requiredRoles && !hasAnyRole(user.role, requiredRoles)) {
    throw new AuthError('Forbidden', 403)
  }

  return user
}
