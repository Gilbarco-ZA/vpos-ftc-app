import { requireAuth as sharedRequireAuth } from '@/src/shared/auth'

export async function requireAuth(requiredRoles?: any[]) {
  return await sharedRequireAuth(requiredRoles)
}
