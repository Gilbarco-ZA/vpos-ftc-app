/**
 * Shared auth is the public app-facing facade.
 * Persistence-heavy user administration lives in src/platform/auth.
 */
import { AuthError } from '@/src/platform/auth/errors'
import { requirePermission } from '@/src/platform/auth/guards/require-permission'
import {
  hashPassword as platformHashPassword,
  verifyPassword as platformVerifyPassword,
} from '@/src/platform/auth/password'
import {
  canAccessStation as platformCanAccessStation,
  hasAnyRole as platformHasAnyRole,
  hasRole as platformHasRole,
} from '@/src/platform/auth/policies'
import {
  cleanupExpiredSessions as platformCleanupExpiredSessions,
  clearSessionCookie as platformClearSessionCookie,
  createSession as platformCreateSession,
  deleteSession as platformDeleteSession,
  deleteUserSessions as platformDeleteUserSessions,
  getSessionByToken as platformGetSessionByToken,
  getSessionCookie as platformGetSessionCookie,
  setSessionCookie as platformSetSessionCookie,
} from '@/src/platform/auth/session'
import {
  authenticateUser as platformAuthenticateUser,
  getCurrentUser as platformGetCurrentUser,
} from '@/src/platform/auth/user-auth'
import {
  createUser as platformCreateUser,
  ensureDefaultAdminUser as platformEnsureDefaultAdminUser,
  setUserActive as platformSetUserActive,
  updatePassword as platformUpdatePassword,
  updateUserProfile as platformUpdateUserProfile,
} from '@/src/platform/auth/user-management'
import {
  checkRateLimit as platformCheckRateLimit,
  clearRateLimit as platformClearRateLimit,
} from '@/src/platform/security/rate-limit/rate-limit'

export { AuthError }

export async function hashPassword(password: string) {
  return await platformHashPassword(password)
}

export async function verifyPassword(password: string, hash: string) {
  return await platformVerifyPassword(password, hash)
}

export async function cleanupExpiredSessions() {
  return await platformCleanupExpiredSessions()
}

export function clearSessionCookie() {
  return platformClearSessionCookie()
}

export async function createSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  return await platformCreateSession(userId, ipAddress, userAgent)
}

export async function deleteSession(token: string) {
  return await platformDeleteSession(token)
}

export async function deleteUserSessions(userId: string) {
  return await platformDeleteUserSessions(userId)
}

export async function getSessionByToken(token: string) {
  return await platformGetSessionByToken(token)
}

export function getSessionCookie() {
  return platformGetSessionCookie()
}

export function setSessionCookie(token: string, expiresAt: Date) {
  return platformSetSessionCookie(token, expiresAt)
}

export async function authenticateUser(email: string, password: string) {
  return await platformAuthenticateUser(email, password)
}

export async function getCurrentUser() {
  return await platformGetCurrentUser()
}

export function canAccessStation(user: any, stationId: string) {
  return platformCanAccessStation(user, stationId)
}

export function hasAnyRole(userRole: any, requiredRoles: any[]) {
  return platformHasAnyRole(userRole, requiredRoles)
}

export function hasRole(userRole: any, requiredRole: any) {
  return platformHasRole(userRole, requiredRole)
}

export async function requireAuth(requiredRoles?: any[]) {
  return await requirePermission(requiredRoles)
}

export async function createUser(input: any) {
  return await platformCreateUser(input)
}

export async function ensureDefaultAdminUser() {
  return await platformEnsureDefaultAdminUser()
}

export async function setUserActive(userId: string, isActive: boolean) {
  return await platformSetUserActive(userId, isActive)
}

export async function updatePassword(userId: string, password: string) {
  return await platformUpdatePassword(userId, password)
}

export async function updateUserProfile(userIdOrInput: any, input?: any) {
  if (typeof userIdOrInput === 'string') {
    return await platformUpdateUserProfile({
      userId: userIdOrInput,
      ...(input || {}),
    })
  }
  return await platformUpdateUserProfile(userIdOrInput)
}

export async function checkRateLimit(
  key: string,
  _max?: number,
  _windowMs?: number,
) {
  return await platformCheckRateLimit(key)
}

export async function clearRateLimit(key: string) {
  return await platformClearRateLimit(key)
}
