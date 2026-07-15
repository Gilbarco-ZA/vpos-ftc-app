import type { SessionUser, User, UserRole } from '@/src/shared/types'

import { verifyPassword } from '@/src/platform/auth/password'
import {
  getSessionByToken,
  getSessionCookie,
} from '@/src/platform/auth/session'
import { query, queryOne } from '@/src/platform/db/postgres'

export const authenticateUser = async (
  usernameOrEmail: string,
  password: string,
): Promise<User | null> => {
  const result = await queryOne<Record<string, unknown>>(
    `SELECT u.*, fs.code as station_code, fs.name as station_name, fs.country as station_country
     FROM users u
     JOIN fuel_stations fs ON u.station_id = fs.id
     WHERE (u.username = $1 OR u.email = $1)
       AND u.is_active = true
       AND u.deleted_at IS NULL
       AND fs.is_active = true`,
    [usernameOrEmail],
  )

  if (!result) return null

  const isValid = verifyPassword(password, result.password_hash as string)
  if (!isValid) return null

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [
    result.id,
  ])

  return {
    id: result.id as string,
    stationId: result.station_id as string,
    username: result.username as string,
    email: result.email as string,
    passwordHash: result.password_hash as string,
    role: result.role as UserRole,
    fullName: result.full_name as string | undefined,
    isActive: result.is_active as boolean,
    lastLoginAt: result.last_login_at
      ? new Date(result.last_login_at as string)
      : undefined,
    cloudUserId: result.cloud_user_id as string | undefined,
    createdAt: new Date(result.created_at as string),
    updatedAt: new Date(result.updated_at as string),
    deletedAt: result.deleted_at
      ? new Date(result.deleted_at as string)
      : undefined,
  }
}

export const getCurrentUser = async (): Promise<SessionUser | null> => {
  const token = await getSessionCookie()
  if (!token) return null
  const session = await getSessionByToken(token)
  if (!session) return null

  const result = await queryOne<Record<string, unknown>>(
    `SELECT u.id, u.station_id, u.username, u.email, u.role, u.full_name,
            fs.id as fs_id, fs.code as fs_code, fs.name as fs_name, fs.country as fs_country
     FROM users u
     JOIN fuel_stations fs ON u.station_id = fs.id
     WHERE u.id = $1
       AND u.is_active = true
       AND u.deleted_at IS NULL`,
    [session.userId],
  )

  if (!result) {
    await queryOne<Record<string, unknown>>(
      `DELETE FROM sessions WHERE user_id = $1;`,
      [session.userId],
    )
    return null
  }

  return {
    id: result.id as string,
    stationId: result.station_id as string,
    username: result.username as string,
    email: result.email as string,
    role: result.role as UserRole,
    fullName: result.full_name as string | undefined,
    station: {
      id: result.fs_id as string,
      code: result.fs_code as string,
      name: result.fs_name as string,
      country: String(result.fs_country || ''),
    },
  }
}
