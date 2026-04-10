import type { SessionUser } from '@/src/shared/types'

import { AuthError } from '@/src/platform/auth/errors'
import { getCurrentUser } from '@/src/platform/auth/user-auth'

export const requireUser = async (): Promise<SessionUser> => {
  const user = await getCurrentUser()
  if (!user) {
    throw new AuthError('Unauthorized', 401)
  }

  return user
}
