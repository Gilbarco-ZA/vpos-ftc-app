import type { User, UserRole } from '@/src/shared/types'

import { hashPassword } from '@/src/platform/auth/password'
import { deleteUserSessions } from '@/src/platform/auth/session'
import { query, queryOne } from '@/src/platform/db/postgres'
import { countActiveUsers } from '@/src/shared/server/users'
import { uuidv4 } from '@/src/shared/utils/ids'
import { logger } from '@/src/shared/utils/logger'

/**
 * Platform auth owns persistence-heavy user management and admin bootstrap.
 * Shared auth re-exports this surface as a public facade for routes/setup.
 */
export const createUser = async (data: {
  stationId: string
  username: string
  email: string
  password: string
  role: UserRole
  fullName?: string
}): Promise<User> => {
  const userId = uuidv4()
  const passwordHash = await hashPassword(data.password)

  const result = await queryOne<Record<string, unknown>>(
    `INSERT INTO users (id, station_id, username, email, password_hash, role, full_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      data.stationId,
      data.username,
      data.email,
      passwordHash,
      data.role,
      data.fullName,
    ],
  )

  if (!result) {
    throw new Error('Failed to create user')
  }

  return {
    id: result.id as string,
    stationId: result.station_id as string,
    username: result.username as string,
    email: result.email as string,
    passwordHash: result.password_hash as string,
    role: result.role as UserRole,
    fullName: result.full_name as string | undefined,
    isActive: result.is_active as boolean,
    createdAt: new Date(result.created_at as string),
    updatedAt: new Date(result.updated_at as string),
  }
}

export const ensureDefaultAdminUser = async (): Promise<boolean> => {
  const adminPassword = (process.env.DEFAULT_ADMIN_PASSWORD || '').trim()
  if (!adminPassword) return false

  const userCount = await countActiveUsers()
  if (userCount > 0) return false

  if (adminPassword.length < 8) {
    logger.warn('[auth]', {
      msg: 'DEFAULT_ADMIN_PASSWORD must be at least 8 characters to bootstrap admin user.',
    })
    return false
  }

  let stationId = (process.env.DEFAULT_ADMIN_STATION_ID || '').trim()
  if (!stationId) {
    const station = await queryOne<{ id: string }>(
      `SELECT id FROM fuel_stations WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    )
    stationId = station?.id || ''
  }

  if (!stationId) {
    logger.warn('[auth]', {
      msg: 'No fuel station found for admin bootstrap. Set DEFAULT_ADMIN_STATION_ID or seed fuel_stations.',
    })
    return false
  }

  const username = (process.env.DEFAULT_ADMIN_USERNAME || 'admin').trim()
  const email = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com').trim()
  const fullName = (
    process.env.DEFAULT_ADMIN_FULL_NAME || 'Administrator'
  ).trim()

  await createUser({
    stationId,
    username,
    email,
    password: adminPassword,
    role: 'administrator',
    fullName,
  })

  return true
}

export const updatePassword = async (
  userId: string,
  newPassword: string,
): Promise<void> => {
  const passwordHash = await hashPassword(newPassword)
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [
    passwordHash,
    userId,
  ])
  await deleteUserSessions(userId)
}

export const setUserActive = async (
  userId: string,
  isActive: boolean,
): Promise<void> => {
  await query('UPDATE users SET is_active = $1 WHERE id = $2', [
    isActive,
    userId,
  ])
  if (!isActive) {
    await deleteUserSessions(userId)
  }
}

export const updateUserProfile = async (data: {
  stationId: string
  userId: string
  username?: string
  email?: string
  role?: UserRole
  fullName?: string
}): Promise<User> => {
  const updates: string[] = []
  const values: Array<string | null> = []

  if (data.username !== undefined) {
    values.push(data.username)
    updates.push(`username = $${values.length}`)
  }
  if (data.email !== undefined) {
    values.push(data.email)
    updates.push(`email = $${values.length}`)
  }
  if (data.role !== undefined) {
    values.push(data.role)
    updates.push(`role = $${values.length}`)
  }
  if (data.fullName !== undefined) {
    values.push(data.fullName)
    updates.push(`full_name = $${values.length}`)
  }

  if (updates.length === 0) {
    throw new Error('No fields provided for update')
  }

  values.push(data.userId, data.stationId)

  const result = await queryOne<Record<string, unknown>>(
    `UPDATE users
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND station_id = $${values.length}
     RETURNING *`,
    values,
  )

  if (!result) {
    throw new Error('User not found')
  }

  return {
    id: result.id as string,
    stationId: result.station_id as string,
    username: result.username as string,
    email: result.email as string,
    passwordHash: result.password_hash as string,
    role: result.role as UserRole,
    fullName: (result.full_name as string) || undefined,
    isActive: result.is_active as boolean,
    createdAt: new Date(result.created_at as string),
    updatedAt: new Date(result.updated_at as string),
  }
}
