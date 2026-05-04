import type { Session } from '@/src/shared/types'
import { cookies, headers } from 'next/headers'

import { getSessionCookieName } from '@/src/platform/config/app-config'
import { query, queryOne } from '@/src/platform/db/postgres'
import { randomBytesAsync, uuidv4 } from '@/src/shared/utils/ids'

const SESSION_EXPIRY_HOURS = 24

export const generateSessionId = (): string => {
  return uuidv4()
}

export const generateSessionToken = async (): Promise<string> => {
  const res = await randomBytesAsync(32)
  return res.toString('hex')
}

const isHttpsRequest = async (): Promise<boolean> => {
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? ''
  const xfSsl = (h.get('x-forwarded-ssl') ?? '').toLowerCase()
  return proto.toLowerCase() === 'https' || xfSsl === 'on'
}

export const createSession = async (
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<Session> => {
  const sessionId = generateSessionId()
  const token = await generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000)

  const result = await queryOne<Session>(
    `INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, token, expires_at, ip_address, user_agent, created_at`,
    [sessionId, userId, token, expiresAt, ipAddress, userAgent],
  )

  if (!result) {
    throw new Error('Failed to create session')
  }

  return {
    id: result.id,
    userId: result.userId as unknown as string,
    token: result.token,
    expiresAt: new Date(result.expiresAt as unknown as string),
    ipAddress: result.ipAddress as string | undefined,
    userAgent: result.userAgent as string | undefined,
    createdAt: new Date(result.createdAt as unknown as string),
  }
}

export const getSessionByToken = async (
  token: string,
): Promise<Session | null> => {
  const result = await queryOne<Record<string, unknown>>(
    `SELECT id, user_id, token, expires_at, ip_address, user_agent, created_at
     FROM sessions
     WHERE token = $1 AND expires_at > NOW()`,
    [token],
  )

  if (!result) return null

  return {
    id: result.id as string,
    userId: result.user_id as string,
    token: result.token as string,
    expiresAt: new Date(result.expires_at as string),
    ipAddress: result.ip_address as string | undefined,
    userAgent: result.user_agent as string | undefined,
    createdAt: new Date(result.created_at as string),
  }
}

export const deleteSession = async (token: string): Promise<void> => {
  await query('DELETE FROM sessions WHERE token = $1', [token])
}

export const deleteUserSessions = async (userId: string): Promise<void> => {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId])
}

export const cleanupExpiredSessions = async (): Promise<number> => {
  const result = await query('DELETE FROM sessions WHERE expires_at <= NOW()')
  return result.rowCount || 0
}

export const setSessionCookie = async (
  token: string,
  expiresAt: Date,
): Promise<void> => {
  const cookieStore = await cookies()
  const secure = await isHttpsRequest()
  cookieStore.set(getSessionCookieName(), token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })
}

export const getSessionCookie = async (): Promise<string | null> => {
  const cookieStore = await cookies()
  return cookieStore.get(getSessionCookieName())?.value || null
}

export const clearSessionCookie = async (): Promise<void> => {
  const cookieStore = await cookies()
  cookieStore.delete(getSessionCookieName())
}
